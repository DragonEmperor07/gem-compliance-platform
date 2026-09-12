#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_python="$project_root/backend/.venv/bin/python"
frontend_root="$project_root/frontend"
ollama_base_url="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
llm_enabled=false

usage() {
  echo "Usage: ./dev.sh [--llm]"
  echo "  ./dev.sh        Start the API and frontend without local LLM inference."
  echo "  ./dev.sh --llm  Also start Ollama and prepare the configured local models."
}

if (( $# > 1 )); then
  usage >&2
  exit 2
fi

case "${1:-}" in
  "") ;;
  --llm) llm_enabled=true ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown option: $1" >&2
    usage >&2
    exit 2
    ;;
esac

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
  [[ -n "${ollama_pid:-}" ]] && kill "$ollama_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ "$llm_enabled" == true ]]; then
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to check the local Ollama service." >&2
    exit 1
  fi

  if ! command -v ollama >/dev/null 2>&1; then
    echo "Ollama is required for --llm mode." >&2
    echo "Install it on macOS with: brew install ollama" >&2
    echo "Then rerun ./dev.sh --llm; it will download the configured models once." >&2
    exit 1
  fi

  if ! curl --fail --silent --max-time 2 "$ollama_base_url/api/tags" >/dev/null; then
    echo "Starting Ollama at $ollama_base_url"
    OLLAMA_HOST="${ollama_base_url#http://}" ollama serve &
    ollama_pid=$!
    ollama_ready=false
    for _ in {1..30}; do
      if curl --fail --silent --max-time 2 "$ollama_base_url/api/tags" >/dev/null; then
        ollama_ready=true
        break
      fi
      sleep 1
    done
    if [[ "$ollama_ready" != true ]]; then
      echo "Ollama did not become ready at $ollama_base_url." >&2
      exit 1
    fi
  else
    echo "Using the Ollama service already running at $ollama_base_url"
  fi

  model_config="$(PYTHONPATH="$project_root/backend" "$backend_python" -c \
    'from app.config import DOCUMENT_CLASSIFIER_MODEL, REQUIREMENT_MODEL; print(REQUIREMENT_MODEL); print(DOCUMENT_CLASSIFIER_MODEL)')"
  requirement_model="${model_config%%$'\n'*}"
  classifier_model="${model_config#*$'\n'}"

  for model in "$requirement_model" "$classifier_model"; do
    if ! OLLAMA_HOST="$ollama_base_url" ollama show "$model" >/dev/null 2>&1; then
      echo "Downloading local model $model (first run only)"
      OLLAMA_HOST="$ollama_base_url" ollama pull "$model"
    else
      echo "Local model ready: $model"
    fi
  done
else
  echo "Local LLM disabled. Use ./dev.sh --llm to enable Ollama inference."
fi

echo "Starting API at http://127.0.0.1:8000"
PYTHONPATH="$project_root/backend" LLM_ENABLED="$llm_enabled" OLLAMA_BASE_URL="$ollama_base_url" \
  "$backend_python" -m uvicorn app.main:app \
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
