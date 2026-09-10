"""
End-to-end orchestrator.

    tender.pdf -> requirements.json -> required_docs.json
    bidder.zip -> extracted/*.json
                        -> report.json  (present / missing / score)

Every stage writes its artifact and --reuse picks them back up, so the slow LLM
extraction is not repeated while iterating on the matching side.

    python run_pipeline.py --tender tender.pdf --zip bidder.zip --workdir out
    python run_pipeline.py --tender tender.pdf --zip bidder.zip --workdir out --reuse
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .bidder_zip import ingest_zip
from .checklist_build import build_checklist, save_checklist
from .doc_check import load_checklist, read_inputs
from .match_engine import match, print_report
from .req import RequirementExtraction


def banner(step: int, title: str) -> None:
    print(f"\n{'=' * 60}\n[{step}/4] {title}\n{'=' * 60}")


def stage_requirements(tender: Path, target: Path, reuse: bool) -> RequirementExtraction:
    if reuse and target.exists():
        print(f"reusing {target}")
        return RequirementExtraction.model_validate_json(target.read_text(encoding="utf-8"))

    from .llm_extract import extract_requirements
    from .tender_pipeline import TenderPipeline

    pipeline = TenderPipeline(str(tender))
    context = pipeline.prepare()

    if not context.strip():
        sys.exit(f"no extractable text in {tender} (scanned tender? OCR needed)")

    print(f"pages {pipeline.candidates}, context {len(context)} chars")

    extraction = extract_requirements(context)
    target.write_text(extraction.model_dump_json(indent=2), encoding="utf-8")

    print(f"{len(extraction.requirements)} requirements -> {target}")
    return extraction


def stage_checklist(extraction, target: Path, name: str, reuse: bool) -> dict:
    if reuse and target.exists():
        print(f"reusing {target}")
        return load_checklist(target)

    checklist = build_checklist(extraction, name)
    save_checklist(checklist, target)

    required = sum(1 for d in checklist["documents"] if d["required"])
    print(f"{len(checklist['documents'])} documents ({required} required) -> {target}")
    return checklist


def stage_bidder(zip_path: Path, out_dir: Path, use_ocr: bool, reuse: bool) -> None:
    if reuse and out_dir.exists() and any(out_dir.iterdir()):
        print(f"reusing {out_dir}")
        return

    documents = ingest_zip(zip_path, out_dir, use_ocr=use_ocr)

    usable = sum(1 for d in documents if d.text)
    print(f"{usable}/{len(documents)} documents yielded text -> {out_dir}")

    for document in documents:
        if not document.text:
            print(f"  unreadable: {document.source_file} ({document.note})")


def main() -> None:
    ap = argparse.ArgumentParser(description="Tender -> bidder compliance pipeline")
    ap.add_argument("--tender", required=True, type=Path)
    ap.add_argument("--zip", required=True, type=Path, dest="zip_path")
    ap.add_argument("--workdir", type=Path, default=Path("out"))
    ap.add_argument("--name", default="Tender document checklist")
    ap.add_argument("--reuse", action="store_true", help="reuse existing artifacts")
    ap.add_argument("--no-ocr", action="store_true")
    ap.add_argument("--no-llm", action="store_true", help="deterministic matching only")
    args = ap.parse_args()

    for path in (args.tender, args.zip_path):
        if not path.exists():
            raise SystemExit(f"not found: {path}")

    work = args.workdir
    work.mkdir(parents=True, exist_ok=True)

    requirements_path = work / "requirements.json"
    checklist_path = work / "required_docs.json"
    extracted_dir = work / "extracted"
    report_path = work / "report.json"

    banner(1, "tender -> requirements")
    extraction = stage_requirements(args.tender, requirements_path, args.reuse)

    banner(2, "requirements -> checklist")
    checklist = stage_checklist(extraction, checklist_path, args.name, args.reuse)

    banner(3, "bidder zip -> extracted text")
    stage_bidder(args.zip_path, extracted_dir, not args.no_ocr, args.reuse)

    banner(4, "matching")
    documents = read_inputs(extracted_dir)
    if not documents:
        raise SystemExit(f"no extracted documents in {extracted_dir}")

    report = match(checklist, documents, use_llm=not args.no_llm)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print_report(report)
    print(f"\nartifacts in {work}/")

    # Non-zero exit when incomplete, so this can gate a job.
    raise SystemExit(0 if report["status"] == "complete" else 1)


if __name__ == "__main__":
    main()
