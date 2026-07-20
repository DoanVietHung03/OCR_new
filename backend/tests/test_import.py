from app.main import app


def test_scaffold_imports() -> None:
    assert app.title == "OCR API"
