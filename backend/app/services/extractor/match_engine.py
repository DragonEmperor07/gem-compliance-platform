"""
Matching engine: required_docs.json  x  bidder submission -> present / missing.

Each bidder document is typed two ways, because the checklist holds two kinds
of id:

    canonical (GST_CERTIFICATE, ...)  -> document_classifier rules
    custom    (BOARD_RESOLUTION, ...) -> alias match against checklist aliases

Presence is never asked of a model. The model only proposes a type; "missing"
stays pure set subtraction inside doc_check.reconcile().

    python match_engine.py --input extracted/ --checklist required_docs.json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from .compliance_score import print_score, score_report
from .doc_check import Classification, alias_match, load_checklist, read_inputs, reconcile
from .document_classifier import classify_document

# One alias hit in a long document is weak -- a single stray mention of
# "turnover" would otherwise mark a certificate present.
ALIAS_MIN_HITS = 2

WEAK_CONFIDENCE = 0.50


def filename_alias_type(name: str, checklist: dict[str, Any]) -> str | None:
    """Return a checklist id when the filename clearly names that evidence.

    This is intentionally exact after punctuation normalisation. It fixes
    distinctive custom types such as ``integrity_pact.txt`` without allowing a
    passing mention inside an unrelated document to count as submitted proof.
    """
    stem = re.sub(r"[^a-z0-9]+", " ", Path(name).stem.lower()).strip()
    for document in checklist["documents"]:
        for alias in document.get("aliases", []):
            clean_alias = re.sub(r"[^a-z0-9]+", " ", alias.lower()).strip()
            if clean_alias and stem == clean_alias:
                return document["id"]
    return None


def alias_hits(text: str, checklist: dict[str, Any], doc_id: str) -> int:
    """
    Count independent alias matches for one entry.

    Aliases nest ("turnover" inside "annual turnover"), so a naive count turns a
    single mention into two hits. Only the longest alias covering a phrase counts.
    """
    low = text.lower()

    matched = sorted(
        (
            alias.lower()
            for doc in checklist["documents"] if doc["id"] == doc_id
            for alias in doc.get("aliases", [])
            if alias.lower() in low
        ),
        key=len,
        reverse=True,
    )

    kept: list[str] = []
    for alias in matched:
        if not any(alias in other for other in kept):
            kept.append(alias)

    return len(kept)


def classify_against_checklist(
    name: str,
    text: str,
    checklist: dict[str, Any],
    use_llm: bool = True,
) -> Classification:
    """Decide one document's type, preferring ids the checklist actually lists."""
    known = {doc["id"] for doc in checklist["documents"]}

    a_type, a_conf, a_ev = alias_match(text, checklist)
    filename_type = filename_alias_type(name, checklist)

    if filename_type is not None:
        if a_type in {"unknown", filename_type}:
            a_type = filename_type
            a_conf = max(a_conf, 0.90)
            a_ev = f"exact evidence title in filename: {Path(name).stem}"

    if a_type != "unknown" and alias_hits(text, checklist, a_type) < ALIAS_MIN_HITS:
        if filename_type != a_type:
            a_conf = min(a_conf, WEAK_CONFIDENCE)

    result = classify_document(name, text, use_llm_fallback=use_llm)
    r_type = result.document_type
    r_conf = result.confidence

    if r_type in {"UNKNOWN", "OTHER"}:
        r_type, r_conf = "unknown", 0.0

    # Both routes agree -> strongest signal available.
    if r_type == a_type and r_type != "unknown":
        return Classification(
            name, r_type, min(1.0, max(r_conf, a_conf) + 0.15),
            "rules+alias", result.reason or a_ev,
        )

    if r_type in known:
        return Classification(name, r_type, r_conf, "rules", result.reason)

    # Custom checklist ids only ever come from aliases.
    if a_type in known and a_conf > 0:
        return Classification(name, a_type, a_conf, "alias", a_ev)

    return Classification(name, r_type, r_conf, "rules", result.reason)


def match(
    checklist: dict[str, Any],
    documents: list[tuple[str, str]],
    use_llm: bool = True,
    verbose: bool = True,
) -> dict[str, Any]:
    results = []

    for index, (name, text) in enumerate(documents, 1):
        classification = classify_against_checklist(name, text, checklist, use_llm)
        results.append(classification)

        if verbose:
            print(
                f"[{index}/{len(documents)}] {name:45s} -> {classification.doc_type} "
                f"({classification.confidence:.2f}, {classification.method})"
            )

    report = reconcile(results, checklist)

    # Scored last: it reads the present/missing split settled above.
    report["compliance"] = score_report(report)

    return report


def print_report(report: dict[str, Any]) -> None:
    counts = report["counts"]

    print(f"\nstatus: {report['status'].upper()}")
    print(
        f"files {counts['files_scanned']}  present {counts['present']}  "
        f"missing {counts['missing']} (required {counts['missing_required']})"
    )

    print_score(report["compliance"])


def main() -> None:
    ap = argparse.ArgumentParser(description="Match bidder documents against a checklist")
    ap.add_argument("--input", required=True, type=Path, help="folder of extracted text")
    ap.add_argument("--checklist", type=Path, default=Path("required_docs.json"))
    ap.add_argument("--out", type=Path, default=Path("report.json"))
    ap.add_argument("--no-llm", action="store_true", help="deterministic rules only")
    args = ap.parse_args()

    checklist = load_checklist(args.checklist)
    documents = read_inputs(args.input)

    if not documents:
        raise SystemExit(f"no .txt or .json files found in {args.input}")

    report = match(checklist, documents, use_llm=not args.no_llm)

    args.out.write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print_report(report)
    print(f"\nwritten to {args.out}")


if __name__ == "__main__":
    main()
