#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_python="$project_root/backend/.venv/bin/python"
frontend_root="$project_root/frontend"

if [[ ! -x "$backend_python" ]]; then
  echo "Backend environment is missing. Create it and install backend/requirements.txt first." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run the frontend." >&2
  exit 1
fi

if [[ ! -f "$frontend_root/node_modules/vite/bin/vite.js" ]]; then
  echo "Frontend dependencies are missing. Run: cd frontend && npm install" >&2
  exit 1
fi

cleanup() {
  trap - EXIT INT TERM
  [[ -n "${backend_pid:-}" ]] && kill "$backend_pid" 2>/dev/null || true
  [[ -n "${frontend_pid:-}" ]] && kill "$frontend_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Starting API at http://127.0.0.1:8000"
PYTHONPATH="$project_root/backend" "$backend_python" -m uvicorn app.main:app \
  --host 127.0.0.1 --port 8000 &
backend_pid=$!

echo "Starting website at http://127.0.0.1:5173"
(
  cd "$frontend_root"
  # Replace the subshell with Vite so cleanup owns the actual server PID.
  exec node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
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
