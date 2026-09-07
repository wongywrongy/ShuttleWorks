"""Extract per-page Markdown text from a reviewed surface-book PDF.

Given a PDF path and an output directory, writes one Markdown file per page
(``p{NNN}.md``, 1-based, zero-padded to 3 digits) containing a page-number
heading and the page's extracted text. Prefers ``layout`` extraction mode
(better for tables); falls back to plain extraction if layout mode yields
less text.

Usage:
    python tools/surface-book-extract.py <pdf_path> <output_dir>
"""

from __future__ import annotations

import sys
from pathlib import Path

from pypdf import PdfReader


def extract_page_text(page: object) -> str:
    """Return the best-effort text for a single PDF page.

    Tries layout-mode extraction first (usually better for tabular content);
    falls back to plain extraction if layout mode returns less text.
    """
    layout_text = ""
    plain_text = ""
    try:
        layout_text = page.extract_text(extraction_mode="layout") or ""
    except Exception:
        layout_text = ""
    try:
        plain_text = page.extract_text() or ""
    except Exception:
        plain_text = ""
    if len(layout_text.strip()) >= len(plain_text.strip()):
        return layout_text
    return plain_text


def extract_pdf(pdf_path: Path, out_dir: Path) -> int:
    """Extract every page of ``pdf_path`` into Markdown files under ``out_dir``.

    Returns the number of pages extracted.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(str(pdf_path))
    page_count = len(reader.pages)
    for index, page in enumerate(reader.pages):
        page_number = index + 1
        text = extract_page_text(page)
        out_path = out_dir / f"p{page_number:03d}.md"
        content = f"# Page {page_number}\n\n{text}\n"
        out_path.write_text(content, encoding="utf-8")
    return page_count


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(f"usage: {argv[0]} <pdf_path> <output_dir>", file=sys.stderr)
        return 2
    pdf_path = Path(argv[1])
    out_dir = Path(argv[2])
    page_count = extract_pdf(pdf_path, out_dir)
    print(f"Extracted {page_count} pages from {pdf_path} to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
