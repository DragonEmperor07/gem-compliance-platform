"""Create small synthetic uploads for the live-backend browser test.

Run using backend/.venv/bin/python. Only a temporary directory is written;
the resulting JSON tells the browser test where to find its upload files.
These files are intentionally synthetic and must never become case fixtures
or seed data in the application.
"""

import json
from pathlib import Path
import tempfile
import zipfile

import pymupdf


def create_fixtures() -> dict[str, str]:
    directory = Path(tempfile.mkdtemp(prefix="trust-setu-e2e-"))
    tender = directory / "synthetic-tender.pdf"
    submission = directory / "synthetic-submission.zip"

    document = pymupdf.open()
    page = document.new_page(width=595, height=842)
    text = """SYNTHETIC TEST TENDER - NOT FOR PROCUREMENT
Tender reference: TS-E2E-2026-001
Supply of office equipment - eligibility criteria

1. The bidder must submit audited annual accounts as documentary evidence.
The minimum average annual turnover of Rs. 50 lakhs is required. The bidder must
provide audited financial statements supporting its annual turnover.

2. The bidder must submit a PAN card showing its Permanent Account Number.

3. The bidder must submit a GST registration certificate showing its GSTIN.

4. The bidder shall submit a signed and stamped undertaking and Integrity
Pact with the tender reference and date. This undertaking must confirm
that all information supplied by the bidder is accurate.

All clauses above are mandatory requirements at bid submission.
These fictional documents are solely for testing the compliance workflow.
"""
    remaining = page.insert_textbox(
        pymupdf.Rect(45, 45, 550, 790), text, fontsize=11, fontname="helv"
    )
    if remaining < 0:
        raise RuntimeError("The synthetic tender did not fit on its page")
    document.save(tender)
    document.close()

    # Deliberately below the tender threshold so the integration test can
    # check that backend findings reach the review screen without alteration.
    evidence = {
        "audited_financial_statements.txt": (
            "SYNTHETIC TEST EVIDENCE\n"
            "Civic Test Supplies Private Limited\n"
            "Audited financial statements and annual accounts.\n"
            "Average annual turnover: INR 40 lakhs.\n"
            "Auditor: Fictional Auditor. Financial year 2025-2026.\n"
        ),
        "pan_card.txt": (
            "SYNTHETIC TEST EVIDENCE\n"
            "PAN card - Permanent Account Number ABCDE1234F.\n"
            "Civic Test Supplies Private Limited\n"
        ),
        "gst_registration_certificate.txt": (
            "SYNTHETIC TEST EVIDENCE\n"
            "GST registration certificate. GSTIN: 27ABCDE1234F1Z5.\n"
            "Civic Test Supplies Private Limited\n"
        ),
        "undertaking.txt": (
            "SYNTHETIC TEST EVIDENCE\n"
            "Signed and stamped undertaking and Integrity Pact.\n"
            "Civic Test Supplies Private Limited\n"
            "Tender reference: TS-E2E-2026-001. Date: 11-09-2026.\n"
            "We confirm that the information supplied is accurate.\n"
            "Signed by: Fictional Signatory. Company stamp: Test company.\n"
        ),
    }
    with zipfile.ZipFile(submission, "w", zipfile.ZIP_DEFLATED) as archive:
        for filename, body in evidence.items():
            archive.writestr(filename, body)

    return {"directory": str(directory), "tender": str(tender), "submission": str(submission)}


if __name__ == "__main__":
    print(json.dumps(create_fixtures()))
