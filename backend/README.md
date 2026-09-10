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

## Verify changes

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest -q \
  app.services.extractor.test_pipeline
PYTHONPATH=backend backend/.venv/bin/python -m compileall -q backend/app
backend/.venv/bin/pip check
```

Never commit `.env`, uploaded tender/bidder documents, extracted text, or the
virtual environment.
