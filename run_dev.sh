#!/usr/bin/env bash
set -e

# Simple script to run backend (FastAPI) and frontend (Vite) together
# Usage: ./run_dev.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/dashboard"

# --- Backend ---
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  echo "[backend] Creating virtual environment..."
  python3 -m venv .venv
fi

source .venv/bin/activate

if [ -f "requirements.txt" ]; then
  echo "[backend] Installing dependencies (requirements.txt)..."
  pip install -r requirements.txt
fi

echo "[backend] Starting uvicorn on http://localhost:8000 ..."
# When running from the backend directory, the app module is `app.main:app`, not `backend.app.main:app`
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

deactivate || true

# --- Frontend ---
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
  echo "[frontend] Installing npm dependencies..."
  npm install
fi

FRONTEND_PORT=5175

echo "[frontend] Starting Vite dev server on http://localhost:$FRONTEND_PORT ..."
VITE_BACKEND_HOST="localhost:8000" npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort &
FRONTEND_PID=$!

trap 'echo "Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true; exit 0' INT TERM

echo "Both backend and frontend are starting."
echo "- Backend:  http://localhost:8000"
echo "- Frontend: http://localhost:$FRONTEND_PORT"
echo "Press Ctrl+C here to stop both."

wait
