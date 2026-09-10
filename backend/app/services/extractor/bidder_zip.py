"""
Bidder submission ingestion: bidder.zip -> extracted/<doc>.json

Output is {"source_file": ..., "text": ...}, exactly what doc_check.read_inputs()
already consumes, so doc_check.py needs no change.

    python bidder_zip.py --zip bidder.zip --out extracted/
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import shutil
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path

import pymupdf

logger = logging.getLogger(__name__)

# PyMuPDF opens PDFs and images alike, so they share one reader.
PYMUPDF_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
TEXT_SUFFIXES = {".txt", ".md", ".csv", ".json", ".xml", ".htm", ".html"}
DOCX_SUFFIXES = {".docx"}

SUPPORTED = PYMUPDF_SUFFIXES | TEXT_SUFFIXES | DOCX_SUFFIXES

SKIP_PARTS = {"__MACOSX", ".DS_Store", "Thumbs.db"}
MAX_NESTED_DEPTH = 3


@dataclass
class ExtractedDocument:
    source_file: str
    text: str
    status: str      # "text" | "ocr" | "empty" | "unsupported" | "error"
    note: str = ""


def is_noise(relative: Path) -> bool:
    if any(part in SKIP_PARTS for part in relative.parts):
        return True
    return any(part.startswith(".") for part in relative.parts)


def safe_extract(zip_path: Path, dest: Path, depth: int = 0) -> None:
    """Extract an archive, refusing entries that escape the destination."""
    dest.mkdir(parents=True, exist_ok=True)
    resolved = dest.resolve()

    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():

            relative = Path(member.filename)

            if member.is_dir() or relative.is_absolute() or is_noise(relative):
                continue

            target = (dest / relative).resolve()

            if not target.is_relative_to(resolved):        # zip-slip guard
                logger.warning("skipping unsafe path %s", member.filename)
                continue

            target.parent.mkdir(parents=True, exist_ok=True)

            with archive.open(member) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)

    if depth >= MAX_NESTED_DEPTH:
        return

    # Bidder submissions are routinely a zip of zips.
    for nested in sorted(dest.rglob("*.zip")):
        try:
            safe_extract(nested, nested.with_suffix(""), depth + 1)
            nested.unlink()
        except zipfile.BadZipFile:
            logger.warning("bad nested archive %s", nested)


def read_pymupdf(path: Path, use_ocr: bool) -> tuple[str, str, str]:
    """Text layer first; OCR only for pages that come back empty."""
    parts, ocr_used, note = [], False, ""

    with pymupdf.open(path) as doc:
        for page in doc:
            text = page.get_text("text", sort=True)

            if not text.strip() and use_ocr:
                try:
                    textpage = page.get_textpage_ocr(flags=0, full=True)
                    text = page.get_text("text", textpage=textpage)
                    ocr_used = bool(text.strip())
                except Exception as exc:              # tesseract absent or failed
                    note = f"ocr unavailable: {exc}"

            if text.strip():
                parts.append(text)

    body = "\n".join(parts)

    if not body.strip():
        return "", "empty", note or "no text layer and no OCR result"

    return body, ("ocr" if ocr_used else "text"), note


def read_docx(path: Path) -> tuple[str, str, str]:
    """Pull the body out of the OOXML package without extra dependencies."""
    with zipfile.ZipFile(path) as archive:
        if "word/document.xml" not in archive.namelist():
            return "", "error", "not an OOXML word document"
        xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")

    text = re.sub(r"<[^>]+>", "", xml.replace("</w:p>", "\n")).strip()
    return (text, "text", "") if text else ("", "empty", "no text in document body")


def read_plain(path: Path) -> tuple[str, str, str]:
    text = path.read_text(encoding="utf-8", errors="ignore")

    if path.suffix.lower() in {".htm", ".html", ".xml"}:
        text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text))

    text = text.strip()
    return (text, "text", "") if text else ("", "empty", "empty file")


def read_document(path: Path, use_ocr: bool = True) -> tuple[str, str, str]:
    suffix = path.suffix.lower()

    try:
        if suffix in PYMUPDF_SUFFIXES:
            return read_pymupdf(path, use_ocr)
        if suffix in DOCX_SUFFIXES:
            return read_docx(path)
        if suffix in TEXT_SUFFIXES:
            return read_plain(path)
    except Exception as exc:
        logger.warning("failed to read %s: %s", path, exc)
        return "", "error", str(exc)

    return "", "unsupported", f"unsupported extension '{suffix}'"


def ingest_dir(root: Path, use_ocr: bool = True) -> list[ExtractedDocument]:
    documents = []

    for path in sorted(root.rglob("*")):

        if not path.is_file():
            continue

        relative = path.relative_to(root)

        if is_noise(relative) or path.suffix.lower() not in SUPPORTED:
            continue

        text, status, note = read_document(path, use_ocr)

        documents.append(ExtractedDocument(
            source_file=str(relative).replace("\\", "/"),
            text=text,
            status=status,
            note=note,
        ))

    return documents


def write_documents(documents: list[ExtractedDocument], out_dir: Path) -> None:
    """One JSON per document, in the layout doc_check.read_inputs() expects."""
    out_dir.mkdir(parents=True, exist_ok=True)

    for document in documents:
        # Flatten the archive path so nested files cannot collide.
        stem = re.sub(r"[^A-Za-z0-9._-]+", "_", "__".join(Path(document.source_file).parts))

        (out_dir / f"{Path(stem).stem}.json").write_text(
            json.dumps(asdict(document), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )


def ingest_zip(
    zip_path: Path,
    out_dir: Path,
    work_dir: Path | None = None,
    use_ocr: bool = True,
) -> list[ExtractedDocument]:
    work_dir = work_dir or out_dir.parent / "_unpacked"

    if work_dir.exists():
        shutil.rmtree(work_dir)

    safe_extract(zip_path, work_dir)

    documents = ingest_dir(work_dir, use_ocr)
    write_documents(documents, out_dir)

    return documents


def main() -> None:
    ap = argparse.ArgumentParser(description="Extract text from a bidder zip")
    ap.add_argument("--zip", required=True, type=Path, dest="zip_path")
    ap.add_argument("--out", type=Path, default=Path("extracted"))
    ap.add_argument("--work", type=Path, help="unpack directory")
    ap.add_argument("--no-ocr", action="store_true")
    args = ap.parse_args()

    if not args.zip_path.exists():
        raise SystemExit(f"archive not found: {args.zip_path}")

    documents = ingest_zip(args.zip_path, args.out, args.work, not args.no_ocr)

    for document in documents:
        print(f"  [{document.status:11s}] {document.source_file:45s} {len(document.text):>6d} chars")

    usable = sum(1 for d in documents if d.text)
    print(f"\n{usable}/{len(documents)} documents yielded text -> {args.out}")

    for document in documents:
        if not document.text:
            print(f"  unreadable: {document.source_file}: {document.note}")


if __name__ == "__main__":
    main()
