"""
Compliance score.

    present       2   document found and confidently classified
    under review  1   a candidate matched, but below the confidence threshold
    missing       0   nothing in the submission looks like it

Scored per checklist document, straight off the reconcile() output.

    python compliance_score.py --report report.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

POINTS = {"present": 2, "review": 1, "missing": 0}


def document_states(report: dict[str, Any]) -> list[dict[str, Any]]:
    """
    One scored row per checklist document.

    present + missing together cover the whole checklist, since reconcile()
    files every document into exactly one of them. A missing entry carrying a
    candidate file was matched but fell under the threshold -- that is "review".
    """
    rows = [
        {"id": e["id"], "label": e["label"], "required": e["required"],
         "state": "present", "detail": ", ".join(e["files"])}
        for e in report["present"]
    ]

    for e in report["missing"]:
        review = "possible_match" in e
        rows.append({
            "id": e["id"],
            "label": e["label"],
            "required": e["required"],
            "state": "review" if review else "missing",
            "detail": e["possible_match"]["file"] if review else "",
        })

    for row in rows:
        row["points"] = POINTS[row["state"]]

    # Worst first, required ahead of optional.
    return sorted(rows, key=lambda r: (r["points"], not r["required"], r["label"]))


def score_report(report: dict[str, Any]) -> dict[str, Any]:
    rows = document_states(report)
    earned = sum(row["points"] for row in rows)
    maximum = POINTS["present"] * len(rows)

    return {
        "earned": earned,
        "maximum": maximum,
        "percentage": round(100.0 * earned / maximum, 1) if maximum else 0.0,
        "present": sum(1 for r in rows if r["state"] == "present"),
        "review": sum(1 for r in rows if r["state"] == "review"),
        "missing": sum(1 for r in rows if r["state"] == "missing"),
        "documents": rows,
    }


def print_score(score: dict[str, Any]) -> None:
    print(
        f"\nCOMPLIANCE SCORE  {score['earned']}/{score['maximum']} "
        f"({score['percentage']}%)   "
        f"present {score['present']}  review {score['review']}  missing {score['missing']}"
    )

    for row in score["documents"]:
        flag = "*" if row["required"] else " "
        detail = f"  {row['detail']}" if row["detail"] else ""
        print(f"  {row['points']}{flag} {row['label']:<38s}{detail}")

    print("  * = required")


def main() -> None:
    ap = argparse.ArgumentParser(description="Score a compliance report")
    ap.add_argument("--report", type=Path, default=Path("report.json"))
    ap.add_argument("--out", type=Path, help="write the score as JSON")
    args = ap.parse_args()

    score = score_report(json.loads(args.report.read_text(encoding="utf-8")))
    print_score(score)

    if args.out:
        args.out.write_text(
            json.dumps(score, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"\nwritten to {args.out}")


if __name__ == "__main__":
    main()
