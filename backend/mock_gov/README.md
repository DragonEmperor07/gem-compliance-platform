# Mock verification provider

This is synthetic demo data. It is not an authorized government integration
and every response sets `authoritative: false` and `environment: DEMO`.

From the repository root:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m uvicorn mock_gov.server:app \
  --host 127.0.0.1 --port 9000
```

Then set these backend environment values:

```text
GOVERNMENT_API_URL=http://127.0.0.1:9000
GOVERNMENT_API_TIMEOUT_SECONDS=5
```

The main backend calls the HTTP API; it never reads `data.json` directly.
