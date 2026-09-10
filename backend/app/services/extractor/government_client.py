"""HTTP client for a configured registry-verification provider.

The client does not assume that a provider is authoritative. Provider responses
must explicitly set ``authoritative: true`` before downstream compliance logic
may treat a successful lookup as authoritative verification.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import requests


class GovernmentClient:
    """Small fail-closed client for supported registry lookups."""

    PATHS = {
        "GST": "/api/gst/{identifier}",
        "PAN": "/api/pan/{identifier}",
        "UDYAM": "/api/udyam/{identifier}",
        "BLACKLIST": "/api/blacklist/{identifier}",
    }

    def __init__(self, base_url: str, timeout: float = 5.0):
        if not base_url.strip():
            raise ValueError("government verification base URL is not configured")
        if timeout <= 0:
            raise ValueError("government verification timeout must be greater than zero")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def lookup(self, service: str, identifier: str) -> dict[str, Any]:
        service = service.upper()
        if service not in self.PATHS:
            raise ValueError(f"unsupported government service: {service}")

        encoded = quote(identifier.strip(), safe="")
        url = self.base_url + self.PATHS[service].format(identifier=encoded)
        try:
            response = requests.get(
                url,
                timeout=self.timeout,
                headers={"Accept": "application/json"},
            )
        except requests.RequestException as exc:
            return {
                "service": service,
                "identifier": identifier,
                "status": "UNAVAILABLE",
                "source": "CONFIGURED_PROVIDER",
                "authoritative": False,
                "error": str(exc),
            }

        try:
            payload = response.json()
        except ValueError:
            payload = {"status": "INVALID_RESPONSE"}
        if not isinstance(payload, dict):
            payload = {"status": "INVALID_RESPONSE"}

        payload.setdefault("service", service)
        payload.setdefault("identifier", identifier)
        payload.setdefault("source", "CONFIGURED_PROVIDER")
        payload.setdefault("authoritative", False)
        if response.status_code == 404:
            payload["status"] = "NOT_FOUND"
        elif response.status_code >= 400:
            payload["status"] = "ERROR"
        else:
            payload.setdefault("status", "UNKNOWN")
        return payload
