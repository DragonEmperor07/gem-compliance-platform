# Backend development

The supported Python runtime is defined in the repository `.python-version`.
The backend is independent of the current frontend and exposes FastAPI routes
under `/api/compliance`.

## Initial setup

```bash
cd /path/to/gem-compliance-platform
python3 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

`backend/requirements.in` lists direct application dependencies.
`backend/requirements.txt` is the fully pinned installation lock used locally
and in CI. Update both deliberately when changing dependencies.

## Run the API

```bash
PYTHONPATH=backend backend/.venv/bin/python -m uvicorn app.main:app \
  --host 127.0.0.1 --port 8000
```

API documentation is available at `http://127.0.0.1:8000/docs`.

Ollama is optional. When it is unavailable, tender extraction returns
`extraction_method: heuristic`, a `fallback_reason`, and a warning.

## Optional verification provider

Registry verification is disabled unless `GOVERNMENT_API_URL` is configured.
The backend exposes `POST /api/compliance/government/verify`, and the full
pipeline includes the same result under `government_verification`. Provider
responses must explicitly contain `authoritative: true` before they can turn a
registry criterion into a pass or fail.

A separate synthetic service is included for local demonstrations only:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m uvicorn mock_gov.server:app \
  --host 127.0.0.1 --port 9000
```

Set `GOVERNMENT_API_URL=http://127.0.0.1:9000` in `backend/.env` to use it.
Its results remain review-required because it reports `authoritative: false`.

## Verify changes

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -q \
  -s backend/app/services/extractor -t backend -p 'test_*.py'
PYTHONPATH=backend backend/.venv/bin/python -m compileall -q backend/app
backend/.venv/bin/pip check
```

Never commit `.env`, uploaded tender/bidder documents, extracted text, or the
virtual environment.
