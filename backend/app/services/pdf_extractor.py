"""Layout-aware PDF text extraction using PyMuPDF with Unicode NFC normalization."""

import re
import unicodedata

import pymupdf


def normalize_extracted_text(text: str) -> str:
    """Normalize extracted text to Unicode NFC with standard Unix newlines."""
    # Standardize newlines (\r\n and \r -> \n)
    standardized = text.replace("\r\n", "\n").replace("\r", "\n")
    # Normalize to Unicode Normalization Form C (NFC)
    normalized = unicodedata.normalize("NFC", standardized)
    # Strip trailing whitespace on lines, while preserving line breaks
    cleaned_lines = [re.sub(r"[ \t]+$", "", line) for line in normalized.split("\n")]
    return "\n".join(cleaned_lines).strip()


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> tuple[str, list[dict[str, str | int]]]:
    """Extract full Unicode NFC normalized text and layout blocks from PDF bytes.

    Returns:
        tuple[str, list[dict]]: (raw_extracted_text, blocks_metadata)
    """
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")  # type: ignore[no-untyped-call]
    all_text_parts: list[str] = []
    blocks_meta: list[dict[str, str | int]] = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        # Extract blocks: (x0, y0, x1, y1, text, block_no, block_type)
        blocks = page.get_text("blocks")  # type: ignore[no-untyped-call]
        for b in blocks:
            # block_type == 0 is text
            if len(b) >= 5 and (len(b) < 7 or b[6] == 0):
                block_text = normalize_extracted_text(str(b[4]).strip())
                if block_text:
                    all_text_parts.append(block_text)
                    blocks_meta.append(
                        {
                            "page": page_idx + 1,
                            "text": block_text,
                        }
                    )

    full_text = "\n\n".join(all_text_parts)
    normalized_full_text = normalize_extracted_text(full_text)
    return normalized_full_text, blocks_meta
