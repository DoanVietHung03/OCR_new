import fitz
import pytest


@pytest.fixture
def pdf_bytes() -> bytes:
    document = fitz.open()
    document.new_page(width=200, height=200)
    content = document.tobytes()
    document.close()
    return content


@pytest.fixture
def encrypted_pdf_bytes() -> bytes:
    document = fitz.open()
    document.new_page()
    content = document.tobytes(
        encryption=fitz.PDF_ENCRYPT_AES_256,
        owner_pw="owner",
        user_pw="user",
    )
    document.close()
    return content


@pytest.fixture
def oversized_pdf_bytes() -> bytes:
    document = fitz.open()
    for _ in range(101):
        document.new_page(width=20, height=20)
    content = document.tobytes()
    document.close()
    return content
