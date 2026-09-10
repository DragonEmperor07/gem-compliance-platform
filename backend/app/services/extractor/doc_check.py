"""
Document checklist reconciliation.

Pipeline:
  1. You extract documents (already working in your code).
  2. Each document is CLASSIFIED into one canonical id from required_docs.json.
  3. Missing documents are computed in Python -- never asked of the model.

Provider is a config switch. Ollama / vLLM / LM Studio / most cloud APIs all
speak the OpenAI wire format, so moving offline -> cloud is a base_url change.

    python doc_check.py --input extracted/ --provider ollama --out report.json
    python doc_check.py --input extracted/ --provider cloud  --out report.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------- providers

PROVIDERS: dict[str, dict[str, str]] = {
    "ollama": {
        "base_url": "http://localhost:11434/v1",
        "api_key": "ollama",                       # ignored by Ollama, must be non-empty
        "model": "qwen3-coder:30b",
    },
    "vllm": {
        "base_url": "http://localhost:8000/v1",
        "api_key": "EMPTY",
        "model": "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    },
    "cloud": {
        # set these in the environment when you flip over
        "base_url": os.getenv("LLM_BASE_URL", ""),
        "api_key": os.getenv("LLM_API_KEY", ""),
        "model": os.getenv("LLM_MODEL", ""),
    },
}

MAX_CHARS = 6000        # how much of each doc to show the classifier
MIN_CONFIDENCE = 0.55   # below this, a hit does not count as "present"


# ---------------------------------------------------------------- data model

@dataclass
class Classification:
    source_file: str
    doc_type: str          # canonical id, or "unknown"
    confidence: float
    method: str            # "llm" | "alias" | "llm+alias"
    evidence: str = ""


# ---------------------------------------------------------------- checklist

def load_checklist(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    ids = [d["id"] for d in data["documents"]]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate document id in checklist")
    return data


def alias_match(text: str, checklist: dict[str, Any]) -> tuple[str, float, str]:
    """Cheap deterministic pass. Runs first; catches the easy cases with no GPU."""
    low = text.lower()
    best, best_hits, best_ev = "unknown", 0, ""
    for doc in checklist["documents"]:
        hits = [a for a in doc.get("aliases", []) if a.lower() in low]
        if len(hits) > best_hits:
            best, best_hits, best_ev = doc["id"], len(hits), ", ".join(hits[:3])
    if best_hits == 0:
        return "unknown", 0.0, ""
    return best, min(0.5 + 0.2 * best_hits, 0.95), f"keywords: {best_ev}"


# ---------------------------------------------------------------- llm client

def make_client(provider: str):
    from openai import OpenAI  # pip install openai

    cfg = PROVIDERS[provider]
    if not cfg["base_url"] or not cfg["model"]:
        sys.exit(f"provider '{provider}' is not configured (base_url / model empty)")
    return OpenAI(base_url=cfg["base_url"], api_key=cfg["api_key"] or "none"), cfg["model"]


SYSTEM = (
    "You classify a single scanned document into exactly one category. "
    "Reply with JSON only. No prose, no markdown fences."
)

TEMPLATE = """Categories (use the id, exactly as written):
{options}
unknown  -- use this if the text does not clearly match any category above.

Document text:
---
{body}
---

Reply with this JSON object and nothing else:
{{"doc_type": "<id>", "confidence": <0.0-1.0>, "evidence": "<short phrase from the text>"}}"""


def parse_json(raw: str) -> dict[str, Any]:
    """Small models add fences and chatter. Pull out the first JSON object."""
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*?\}", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {}


def classify_llm(client, model: str, text: str, checklist: dict[str, Any]) -> tuple[str, float, str]:
    options = "\n".join(f'  {d["id"]}  -- {d["label"]}' for d in checklist["documents"])
    prompt = TEMPLATE.format(options=options, body=text[:MAX_CHARS])

    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        max_tokens=200,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
    )
    data = parse_json(resp.choices[0].message.content or "")

    valid = {d["id"] for d in checklist["documents"]}
    doc_type = data.get("doc_type", "unknown")
    if doc_type not in valid:
        doc_type = "unknown"
    try:
        conf = max(0.0, min(1.0, float(data.get("confidence", 0.0))))
    except (TypeError, ValueError):
        conf = 0.0
    return doc_type, conf, str(data.get("evidence", ""))[:200]


def classify(client, model: str, name: str, text: str, checklist: dict) -> Classification:
    a_type, a_conf, a_ev = alias_match(text, checklist)
    try:
        l_type, l_conf, l_ev = classify_llm(client, model, text, checklist)
    except Exception as exc:                      # model down, timeout, bad JSON
        return Classification(name, a_type, a_conf, "alias", f"{a_ev} (llm failed: {exc})")

    if l_type == a_type and l_type != "unknown":  # both agree -> trust it
        return Classification(name, l_type, min(1.0, l_conf + 0.15), "llm+alias", l_ev or a_ev)
    if l_type == "unknown" and a_type != "unknown":
        return Classification(name, a_type, a_conf, "alias", a_ev)
    return Classification(name, l_type, l_conf, "llm", l_ev)


# ---------------------------------------------------------------- reconcile

def reconcile(results: list[Classification], checklist: dict[str, Any]) -> dict[str, Any]:
    """The actual fix: missing = required - found. Pure set logic, no model."""
    by_type: dict[str, list[Classification]] = {}
    for r in results:
        if r.doc_type != "unknown" and r.confidence >= MIN_CONFIDENCE:
            by_type.setdefault(r.doc_type, []).append(r)

    present, missing, low_conf = [], [], []
    for doc in checklist["documents"]:
        hits = by_type.get(doc["id"], [])
        if hits:
            present.append({
                "id": doc["id"],
                "label": doc["label"],
                "required": doc["required"],
                "files": [h.source_file for h in hits],
                "confidence": round(max(h.confidence for h in hits), 2),
                "duplicate": len(hits) > 1,
                "requirements": doc.get("requirements", []),
                "criteria": doc.get("criteria", []),
            })
        else:
            entry = {
                "id": doc["id"],
                "label": doc["label"],
                "required": doc["required"],
                "requirements": doc.get("requirements", []),
                "criteria": doc.get("criteria", []),
            }
            weak = [r for r in results if r.doc_type == doc["id"]]
            if weak:                               # matched, but under threshold
                entry["possible_match"] = {
                    "file": weak[0].source_file,
                    "confidence": round(weak[0].confidence, 2),
                }
                low_conf.append(entry)
            missing.append(entry)

    unrecognised = [
        {"file": r.source_file, "confidence": round(r.confidence, 2)}
        for r in results
        if r.doc_type == "unknown" or r.confidence < MIN_CONFIDENCE
    ]
    missing_required = [m for m in missing if m["required"]]

    return {
        "checklist": checklist["checklist_name"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "complete" if not missing_required else "incomplete",
        "counts": {
            "files_scanned": len(results),
            "present": len(present),
            "missing": len(missing),
            "missing_required": len(missing_required),
            "unrecognised": len(unrecognised),
        },
        "present": present,
        "missing": missing,
        "needs_review": low_conf + unrecognised,
        "classifications": [asdict(r) for r in results],
    }


# ---------------------------------------------------------------- entrypoint

def read_inputs(input_dir: Path) -> list[tuple[str, str]]:
    """Expects one .txt/.json per extracted document. Swap this for your extractor."""
    out = []
    for p in sorted(input_dir.iterdir()):
        if p.suffix.lower() == ".txt":
            out.append((p.name, p.read_text(encoding="utf-8", errors="ignore")))
        elif p.suffix.lower() == ".json":
            blob = json.loads(p.read_text(encoding="utf-8"))
            out.append((p.name, blob.get("text", json.dumps(blob))))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, type=Path, help="folder of extracted document text")
    ap.add_argument("--checklist", type=Path, default=Path("required_docs.json"))
    ap.add_argument("--provider", default="ollama", choices=list(PROVIDERS))
    ap.add_argument("--out", type=Path, default=Path("report.json"))
    args = ap.parse_args()

    checklist = load_checklist(args.checklist)
    docs = read_inputs(args.input)
    if not docs:
        sys.exit(f"no .txt or .json files found in {args.input}")

    client, model = make_client(args.provider)

    results = []
    for i, (name, text) in enumerate(docs, 1):
        c = classify(client, model, name, text, checklist)
        print(f"[{i}/{len(docs)}] {name:40s} -> {c.doc_type} ({c.confidence:.2f}, {c.method})")
        results.append(c)

    report = reconcile(results, checklist)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nstatus: {report['status']}")
    for m in report["missing"]:
        flag = "REQUIRED" if m["required"] else "optional"
        print(f"  missing [{flag}] {m['label']}")
    print(f"\nwritten to {args.out}")


if __name__ == "__main__":
    main()
