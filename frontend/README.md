# Trust Setu — compliance workstation

An independent React, TypeScript and Vite frontend for the existing FastAPI
backend. Its home screen is a verification queue, followed by tender requirement
review, bidder evidence, an officer decision and an exportable case record.
The navy, paper and ink interface uses local fonts, compact document layouts and
explicit source provenance. The existing `frontend-temp/` is independent and is
not needed to run this application.

## Run locally

Set up the Python environment and backend dependencies using
[the backend instructions](../backend/README.md). From the repository root, start
the existing API in one terminal:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m uvicorn app.main:app \
  --host 127.0.0.1 --port 8000
```

In a second terminal, from the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. The application starts with an empty local queue;
create a case with a tender PDF and a bidder ZIP to use the real backend.
The ZIP can also be attached after reviewing the tender. Frontend upload limits
match the backend defaults: 25 MB for the tender and 50 MB for the bidder ZIP.

The development server requires port 5173 to be free. If an API is already
running on port 8000, use that process instead of starting another one.

## Backend connection

The browser makes same-origin requests. Vite forwards `/api` to the API and
rewrites `/health` to its root endpoint, so local use does not require changing
the backend's CORS configuration.

| Frontend request | Existing backend endpoint | Purpose |
| --- | --- | --- |
| `GET /health` | `GET /` | Confirm that the configured service is the GeM API |
| `POST /api/compliance/tenders/requirements` | Same path | Extract the tender requirements and original source references |
| `POST /api/compliance/pipeline` | Same path | Assess the bidder ZIP against the officer-reviewed requirements |

The default proxy target is `http://127.0.0.1:8000`. To use a different API,
create `frontend/.env` using `.env.example` and set `API_PROXY_TARGET`, then
restart Vite. This is a server-side proxy setting. Do not put credentials in
`VITE_*` variables, which are exposed to browser code.

The backend controls requirement extraction and registry access. If Ollama is
unavailable, the interface shows the returned heuristic extraction warning.
If no government provider is configured, registry checks remain unverified.
Synthetic or non-authoritative provider results retain that status. Provider
check times are shown only when supplied by the backend; an assessment time is
not presented as a registry check time. The backend currently supplies tender
page references but does not supply submitted-document page numbers.

## Case records and decisions

Cases, uploaded PDFs/ZIPs, original backend responses, reviewed requirements and
officer decisions are saved in this browser's IndexedDB. Records survive a page
reload but are scoped to the browser profile and origin; `localhost`,
`127.0.0.1`, and different ports have separate storage. Clearing site data removes
these records. The existing backend provides analysis, not a shared case store,
user accounts or server-side decision history.

Recording a decision requires an officer name and written reason. Amending it
preserves the previous decision and adds an activity entry. These are local
records, not signed or tamper-proof audit logs.

The evidence JSON export includes case metadata, original API payloads, source
authority, requirement exclusions, decisions and activity. It contains source
file metadata but excludes raw PDF and ZIP bytes. The report view supports the
browser's print / save-as-PDF flow. Export records for retention and retain the
original documents separately when required.

## Build and verify

Run these commands from `frontend/`:

```bash
npm run build
npm test
npm run test:e2e
```

The production build is written to `dist/`. Unit tests cover API handling,
evidence interpretation and local record persistence. Browser tests use the
real running backend, generate temporary synthetic tender and bidder files,
exercise the review and decision flow, and check a narrow mobile viewport.
They do not seed the normal application queue or mock successful API responses.

Before browser tests, start the backend as shown above. Playwright starts or
reuses the frontend development server. It uses local Google Chrome on macOS
when present; otherwise install its Chromium browser with:

```bash
npx playwright install chromium
```

Optional test environment settings are `E2E_BASE_URL` for an already-running
frontend and `E2E_PYTHON` for the Python executable used to generate fixtures
(default: `backend/.venv/bin/python`). That Python environment needs the backend
dependencies installed.

For a local check of the built files:

```bash
npm run preview
```

This serves a preview at <http://127.0.0.1:4173> with the same API proxy. Its
browser storage is separate from the development server's storage.

## Production serving

Serve `dist/` through a static host or web server and configure a reverse proxy
for `/api/compliance/*` to the existing backend, preserving the request path.
Route `/health` to the backend's `/` endpoint. Ensure the proxy supports the
configured upload sizes and allows sufficient time for document extraction.
`API_PROXY_TARGET` configures Vite's development and preview processes; it does
not configure a production static host. `vite preview` is a local build preview,
not the production serving setup.

Shared case storage, authenticated officer identities and a server-enforced
audit history require additional backend capabilities beyond the current API.
