from __future__ import annotations

import base64
import getpass
import hashlib
import hmac
import json
import secrets
import sys
import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

COOKIE = "ocr_session"
SESSION_SECONDS = 8 * 60 * 60
SCRYPT_N, SCRYPT_R, SCRYPT_P = 16384, 8, 1


def _settings():
    from .settings import settings
    return settings


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(max_length=128)
    password: str = Field(max_length=1024)


class SessionResponse(BaseModel):
    authenticated: bool
    username: str
    expires_at: datetime


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    if len(password) < 6:
        raise ValueError("password must contain at least 6 characters")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P)
    return f"scrypt:{SCRYPT_N},{SCRYPT_R},{SCRYPT_P}:{_b64(salt)}:{_b64(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, params, salt, expected = encoded.split(":")
        n, r, p = map(int, params.split(","))
        if algorithm != "scrypt" or (n, r, p) != (SCRYPT_N, SCRYPT_R, SCRYPT_P):
            return False
        actual = hashlib.scrypt(password.encode(), salt=_unb64(salt), n=n, r=r, p=p)
        return hmac.compare_digest(actual, _unb64(expected))
    except (ValueError, TypeError):
        return False


def _credential_version() -> str:
    settings = _settings()
    value = f"{settings.ocr_auth_username}\0{settings.ocr_auth_password_hash}".encode()
    return hashlib.sha256(value).hexdigest()[:24]


def issue_session(now: int | None = None) -> tuple[str, int]:
    settings = _settings()
    issued = int(time.time() if now is None else now)
    expires = issued + SESSION_SECONDS
    payload = _b64(json.dumps({"iat": issued, "exp": expires, "cv": _credential_version()}, separators=(",", ":")).encode())
    signature = hmac.new(bytes.fromhex(settings.ocr_auth_session_secret), payload.encode(), hashlib.sha256).digest()
    return f"{payload}.{_b64(signature)}", expires


def current_session(request: Request, now: int | None = None) -> dict | None:
    settings = _settings()
    if settings.ocr_auth_mode == "disabled":
        current = int(time.time() if now is None else now)
        return {"iat": current, "exp": current + SESSION_SECONDS, "username": "anonymous"}
    token = request.cookies.get(COOKIE, "")
    if not token or len(token) > 1024:
        return None
    try:
        payload, signature = token.split(".")
        expected = hmac.new(bytes.fromhex(settings.ocr_auth_session_secret), payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(signature)):
            return None
        data = json.loads(_unb64(payload))
        current = int(time.time() if now is None else now)
        if set(data) != {"iat", "exp", "cv"} or not all(type(data[key]) is int for key in ("iat", "exp")):
            return None
        if data["iat"] > current + 60 or data["exp"] != data["iat"] + SESSION_SECONDS or current >= data["exp"]:
            return None
        if not hmac.compare_digest(str(data["cv"]), _credential_version()):
            return None
        return {**data, "username": settings.ocr_auth_username}
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None


def require_authenticated(request: Request) -> dict:
    session = current_session(request)
    if session is None:
        raise HTTPException(401, {"code": "auth_required", "message": "auth_required"})
    return session


def require_safe_browser_request(request: Request) -> None:
    settings = _settings()
    if settings.ocr_auth_mode != "shared" or request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return
    if request.headers.get("X-OCR-Request") != "browser":
        raise HTTPException(403, {"code": "csrf_rejected", "message": "csrf_rejected"})
    origin = request.headers.get("Origin")
    if origin and origin != settings.ocr_public_origin:
        raise HTTPException(403, {"code": "csrf_rejected", "message": "csrf_rejected"})


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=SessionResponse)
async def login(payload: LoginRequest, request: Request, response: Response):
    settings = _settings()
    require_safe_browser_request(request)
    username = payload.username.strip()
    if (
        settings.ocr_auth_mode != "shared"
        or not hmac.compare_digest(username, settings.ocr_auth_username)
        or not verify_password(payload.password, settings.ocr_auth_password_hash)
    ):
        raise HTTPException(401, {"code": "invalid_credentials", "message": "invalid_credentials"})
    token, expires = issue_session()
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, samesite="lax", secure=False, path="/")
    return {"authenticated": True, "username": settings.ocr_auth_username, "expires_at": datetime.fromtimestamp(expires, timezone.utc)}


@router.get("/session", response_model=SessionResponse)
async def session(request: Request):
    settings = _settings()
    if settings.ocr_auth_mode == "disabled":
        return {"authenticated": False, "username": "", "expires_at": datetime.now(timezone.utc)}
    value = require_authenticated(request)
    return {"authenticated": True, "username": value["username"], "expires_at": datetime.fromtimestamp(value["exp"], timezone.utc)}


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response):
    require_safe_browser_request(request)
    response.delete_cookie(COOKIE, path="/", httponly=True, samesite="lax")


def main() -> None:
    if sys.argv[1:] != ["hash-password"]:
        raise SystemExit("usage: python -m app.auth hash-password")
    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Confirm password: "):
        raise SystemExit("passwords do not match")
    try:
        print(hash_password(password))
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
