#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_python="$project_root/backend/.venv/bin/python"

if [[ ! -x "$backend_python" ]]; then
  echo "Backend environment is missing. Create it and install backend/requirements.txt first." >&2
  exit 1
fi

if [[ ! -d "$project_root/frontend-temp/node_modules" ]]; then
  echo "Frontend dependencies are missing. Run: cd frontend-temp && npm install" >&2
  exit 1
fi

cleanup() {
  trap - EXIT INT TERM
  [[ -n "${backend_pid:-}" ]] && kill "$backend_pid" 2>/dev/null || true
  [[ -n "${frontend_pid:-}" ]] && kill "$frontend_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting API at http://127.0.0.1:8000"
PYTHONPATH="$project_root/backend" "$backend_python" -m uvicorn app.main:app \
  --host 127.0.0.1 --port 8000 &
backend_pid=$!

echo "Starting website at http://127.0.0.1:4321/app/extract"
(
  cd "$project_root/frontend-temp"
  npm run dev -- --host 127.0.0.1 --port 4321
) &
frontend_pid=$!

while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done

status=0
if ! kill -0 "$backend_pid" 2>/dev/null; then
  wait "$backend_pid" || status=$?
fi
if ! kill -0 "$frontend_pid" 2>/dev/null; then
  wait "$frontend_pid" || status=$?
fi
exit "$status"
