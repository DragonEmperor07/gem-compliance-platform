from __future__ import annotations

import io
import unittest
import zipfile
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.extractor.bidder_zip import ExtractedDocument
from app.services.extractor.government_client import GovernmentClient
from app.services.extractor.government_verification import extract_identifiers, verify_documents
from app.services.extractor.real_validation import _content_result
from mock_gov.server import app as mock_government_app


class TestGovernmentClient(unittest.TestCase):
    def test_encodes_path_and_preserves_provider_provenance(self):
        response = Mock(status_code=200)
        response.json.return_value = {
            "source": "MOCK_GOVERNMENT_DATA",
            "environment": "DEMO",
            "status": "CLEAR",
        }
        with patch("app.services.extractor.government_client.requests.get", return_value=response) as get:
            result = GovernmentClient("http://provider.test").lookup("BLACKLIST", "ABC & Sons")
        self.assertEqual(get.call_args.args[0], "http://provider.test/api/blacklist/ABC%20%26%20Sons")
        self.assertFalse(result["authoritative"])

    def test_unavailable_provider_fails_closed(self):
        with patch(
            "app.services.extractor.government_client.requests.get",
            side_effect=__import__("requests").ConnectionError("offline"),
        ):
            result = GovernmentClient("http://provider.test").lookup("GST", "27ABCDE1234F1Z5")
        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertFalse(result["authoritative"])


class TestGovernmentVerification(unittest.TestCase):
    def setUp(self):
        self.documents = [
            ExtractedDocument("gst.txt", "GSTIN 27ABCDE1234F1Z5", "text"),
            ExtractedDocument("pan.txt", "PAN ABCDE1234F", "text"),
            ExtractedDocument("udyam.txt", "UDYAM-MH-12-0012345", "text"),
        ]

    def test_extracts_and_deduplicates_supported_identifiers(self):
        found = extract_identifiers(self.documents + [
            ExtractedDocument("copy.txt", "GSTIN 27ABCDE1234F1Z5", "text"),
        ])
        self.assertEqual(found["GST"][0]["identifier"], "27ABCDE1234F1Z5")
        self.assertEqual(found["PAN"][0]["identifier"], "ABCDE1234F")
        self.assertEqual(found["UDYAM"][0]["identifier"], "UDYAM-MH-12-0012345")
        self.assertEqual(len(found["GST"]), 1)

    def test_unconfigured_provider_keeps_values_unverified(self):
        result = verify_documents(self.documents, None)
        self.assertEqual(result["overall"], "NOT_CONFIGURED")
        self.assertFalse(result["authoritative"])
        self.assertEqual(result["checks"], [])

    def test_demo_provider_is_never_authoritative(self):
        client = Mock()
        client.lookup.side_effect = [
            {"source": "MOCK_GOVERNMENT_DATA", "environment": "DEMO", "authoritative": False, "status": "ACTIVE", "legal_name": "ABC Engineering Pvt Ltd"},
            {"source": "MOCK_GOVERNMENT_DATA", "environment": "DEMO", "authoritative": False, "status": "VALID", "legal_name": "ABC Engineering Pvt Ltd"},
            {"source": "MOCK_GOVERNMENT_DATA", "environment": "DEMO", "authoritative": False, "status": "ACTIVE", "enterprise_name": "ABC Engineering Pvt Ltd"},
            {"source": "MOCK_GOVERNMENT_DATA", "environment": "DEMO", "authoritative": False, "status": "CLEAR", "blacklisted": False},
        ]
        result = verify_documents(self.documents, client, bidder_name="ABC Engineering Pvt Ltd")
        self.assertEqual(result["overall"], "REVIEW")
        self.assertFalse(result["authoritative"])
        self.assertEqual(result["summary"]["checks"], 4)
        self.assertEqual(result["summary"]["verified"], 0)
        self.assertEqual(result["summary"]["reported_valid"], 4)

    def test_authoritative_result_can_complete_registry_criterion(self):
        verification = {
            "checks": [{
                "service": "GST",
                "identifier": "27ABCDE1234F1Z5",
                "status": "ACTIVE",
                "source": "AUTHORIZED_GST_PROVIDER",
                "environment": "PRODUCTION",
                "authoritative": True,
                "entity_match": True,
            }]
        }
        state, _, evidence = _content_result(
            "GST_CERTIFICATE",
            "GSTIN 27ABCDE1234F1Z5",
            verification,
        )
        self.assertEqual(state, "pass")
        self.assertTrue(evidence["authoritative"])


class TestGovernmentEndpoint(unittest.TestCase):
    def test_endpoint_returns_not_configured_without_fake_verification(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr("gst.txt", "GSTIN 27ABCDE1234F1Z5")
        with patch("app.services.extractor.api_pipeline.GOVERNMENT_API_URL", ""):
            response = TestClient(app).post(
                "/api/compliance/government/verify",
                files={"submission": ("bidder.zip", archive.getvalue(), "application/zip")},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["overall"], "NOT_CONFIGURED")

    def test_endpoint_calls_configured_provider_and_labels_demo_result(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr("gst.txt", "GSTIN 27ABCDE1234F1Z5")
        provider_response = Mock(status_code=200)
        provider_response.json.return_value = {
            "source": "MOCK_GOVERNMENT_DATA",
            "environment": "DEMO",
            "authoritative": False,
            "status": "ACTIVE",
            "legal_name": "ABC Engineering Pvt Ltd",
        }
        with (
            patch("app.services.extractor.api_pipeline.GOVERNMENT_API_URL", "http://provider.test"),
            patch("app.services.extractor.government_client.requests.get", return_value=provider_response),
        ):
            response = TestClient(app).post(
                "/api/compliance/government/verify",
                files={"submission": ("bidder.zip", archive.getvalue(), "application/zip")},
                data={"bidder_name": "ABC Engineering Pvt Ltd"},
            )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["authoritative"])
        self.assertEqual(payload["checks"][0]["status"], "ACTIVE")
        self.assertEqual(payload["checks"][0]["entity_match"], True)


class TestMockGovernmentProvider(unittest.TestCase):
    def test_demo_provider_cannot_claim_authority(self):
        client = TestClient(mock_government_app)
        response = client.get("/api/gst/27ABCDE1234F1Z5")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ACTIVE")
        self.assertEqual(response.json()["environment"], "DEMO")
        self.assertFalse(response.json()["authoritative"])

    def test_unknown_identifier_is_not_found(self):
        response = TestClient(mock_government_app).get("/api/pan/AAAAA0000A")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["status"], "NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
