"""Unit tests for PyMuPDF layout-aware extraction and Unicode NFC normalization."""

import pymupdf

from app.services.pdf_extractor import (
    extract_text_from_pdf_bytes,
    normalize_extracted_text,
)


def create_synthetic_pdf_bytes(text_lines: list[str]) -> bytes:
    """Helper to generate in-memory synthetic PDF bytes using PyMuPDF."""
    doc = pymupdf.open()
    page = doc.new_page()
    y_pos = 72
    for line in text_lines:
        page.insert_text((50, y_pos), line, fontsize=12)
        y_pos += 24
    pdf_bytes: bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_normalize_extracted_text() -> None:
    """Verify Unicode NFC normalization and line ending standardization."""
    sample = "Line 1\r\nLine 2\rLine 3  \n"
    normalized = normalize_extracted_text(sample)
    assert "\r" not in normalized
    assert normalized == "Line 1\nLine 2\nLine 3"


def test_extract_text_from_pdf_bytes() -> None:
    """Verify layout extraction from synthetic PDF stream."""
    lines = [
        "Alex Rivera",
        "Staff Backend Engineer",
        "Experience",
        "Architected distributed Kafka pipeline processing 50k events/sec.",
    ]
    pdf_bytes = create_synthetic_pdf_bytes(lines)

    text, blocks = extract_text_from_pdf_bytes(pdf_bytes)
    assert "Alex Rivera" in text
    assert "Staff Backend Engineer" in text
    assert "Architected distributed Kafka pipeline" in text
    assert len(blocks) >= 1
