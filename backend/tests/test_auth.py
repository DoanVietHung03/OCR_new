import os
import subprocess
import sys

from fastapi.testclient import TestClient

from app.auth import COOKIE, SESSION_SECONDS, current_session, hash_password, issue_session, verify_password
from app.main import app
from app.settings import Settings, settings


def shared(monkeypatch):
    password_hash = hash_password("secret1")
    for name, value in {
        "ocr_auth_mode": "shared",
        "ocr_public_origin": "http://demo",
        "ocr_auth_username": "ocr",
        "ocr_auth_password_hash": password_hash,
        "ocr_auth_session_secret": "ab" * 32,
    }.items():
        monkeypatch.setattr(settings, name, value)
    return TestClient(app), password_hash


def test_shared_auth_login_cookie_csrf_expiry_and_rotation(monkeypatch):
    client, password_hash = shared(monkeypatch)
    assert verify_password("secret1", password_hash)
    assert not verify_password(" secret1", password_hash)
    assert client.get("/health").status_code == 200
    assert client.get("/api/state").json()["detail"]["code"] == "auth_required"
    assert client.post("/api/auth/login", json={"username": "ocr", "password": "secret1"}).status_code == 403
    wrong = client.post("/api/auth/login", headers={"X-OCR-Request": "browser"}, json={"username": "OCR", "password": "secret1"})
    assert (wrong.status_code, wrong.json()["detail"]["code"]) == (401, "invalid_credentials")

    login = client.post(
        "/api/auth/login",
        headers={"X-OCR-Request": "browser", "Origin": "http://demo"},
        json={"username": " ocr ", "password": "secret1"},
    )
    assert login.status_code == 200
    assert login.json()["username"] == "ocr"
    assert all(value in login.headers["set-cookie"] for value in ("HttpOnly", "SameSite=lax", "Max-Age=28800", "Path=/"))
    assert client.get("/api/auth/session").status_code == 200
    assert client.post("/api/jobs", json={"file_count": 1}).status_code == 403
    assert client.post("/api/jobs", headers={"X-OCR-Request": "browser", "Origin": "http://wrong"}, json={"file_count": 1}).status_code == 403

    token, issued_expiry = issue_session(now=100)
    request = type("Request", (), {"cookies": {COOKIE: token}})()
    assert current_session(request, now=issued_expiry - 1)
    assert current_session(request, now=issued_expiry) is None
    monkeypatch.setattr(settings, "ocr_auth_password_hash", hash_password("secret2"))
    assert current_session(request, now=101) is None
    logout = client.post("/api/auth/logout", headers={"X-OCR-Request": "browser", "Origin": "http://demo"})
    assert logout.status_code == 204
    assert "Max-Age=0" in logout.headers["set-cookie"]


def test_auth_settings_fail_closed_and_password_minimum():
    for payload in (
        {"ocr_auth_mode": "unknown"},
        {"ocr_auth_mode": "shared"},
        {"ocr_auth_mode": "shared", "ocr_public_origin": "http://demo", "ocr_auth_username": "ocr", "ocr_auth_password_hash": "x", "ocr_auth_session_secret": "bad"},
    ):
        try:
            Settings(_env_file=None, **payload)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid auth settings accepted")
    try:
        hash_password("short")
    except ValueError:
        pass
    else:
        raise AssertionError("short password accepted")


def test_disabled_session_does_not_expose_login_controls(monkeypatch):
    monkeypatch.setattr(settings, "ocr_auth_mode", "disabled")
    payload = TestClient(app).get("/api/auth/session").json()
    assert payload["authenticated"] is False
    assert payload["username"] == ""


def test_hash_password_cli_is_available_before_auth_config():
    environment = {**os.environ, "OCR_AUTH_MODE": "shared", "OCR_AUTH_SESSION_SECRET": "invalid"}
    result = subprocess.run(
        [sys.executable, "-m", "app.auth", "wrong-command"],
        cwd="backend", env=environment, capture_output=True, text=True,
    )
    assert result.returncode != 0
    assert "usage: python -m app.auth hash-password" in result.stderr
    assert "ValidationError" not in result.stderr
