# AI-Based Intrusion Detection System (IDS)

An end-to-end IDS that trains an ML model on common network intrusion datasets (CICIDS2017, UNSW-NB15), runs a FastAPI backend for real-time classification, and a React dashboard for alerts and trends. Includes a replay script to simulate live traffic from CSVs.

Tech stack
- Python 3.10+
- scikit-learn, pandas, numpy, joblib
- FastAPI + Uvicorn (WebSocket for live alerts)
- Optional: MQTT (paho-mqtt) for ingestion
- React (Vite) dashboard

Repo layout
- ml/ — training pipeline, model artifacts
- backend/ — FastAPI service exposing /predict, /ingest and /ws/alerts
- dashboard/ — React UI subscribing to real-time alerts
- scripts/ — data replay utilities

Getting started
1) Prereqs
- Python 3.10+
- Node.js 18+
- Optional: local MQTT broker (e.g., eclipse-mosquitto) if you want MQTT ingestion

2) Prepare dataset
- Download one or more CSVs locally. Examples:
  - CICIDS2017: combined_csv files (Label column, normal/malicious)
  - UNSW-NB15: CSVs with label (0/1) and attack_cat columns
- Place CSVs under ml/data/

3) Create virtual environment and install deps
- ML deps
  - python -m venv .venv
  - source .venv/bin/activate
  - pip install -r ml/requirements.txt
- Backend deps
  - pip install -r backend/requirements.txt

4) Train a baseline model (RandomForest)
- Example (train on first 300k rows of all CSVs in data/):
  - python ml/train.py --data ml/data --nrows 300000 --model-out ml/models/model.joblib
- You should see classification metrics; model and schema saved under ml/models/

5) Run the backend
- uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
- Endpoints:
  - GET  /health
  - POST /predict (single record JSON)
  - POST /ingest (single record JSON; also broadcasts to WebSocket if malicious)
  - WS   /ws/alerts (real-time alerts stream)

6) Run the dashboard
- cd dashboard
- npm install
- npm run dev
- Open the shown localhost URL; it will connect to ws://localhost:8000/ws/alerts

7) Simulate live traffic
- python scripts/replay_to_http.py --csv ml/data/your.csv --rate 25
- This will POST rows to /ingest and you’ll see alerts in the dashboard if the model flags them as malicious.

Optional: MQTT ingestion
- Set environment variables for the backend before starting it:
  - MQTT_BROKER_URL=tcp://localhost:1883
  - MQTT_TOPIC=ids/traffic
- Run a local broker (e.g., Docker: docker run -p 1883:1883 eclipse-mosquitto)
- Write/publish JSON feature payloads to the topic; backend will predict and broadcast alerts.

Notes
- Feature handling is dataset-agnostic: a preprocessing pipeline imputes, scales numeric features, and one-hot encodes categoricals; high-cardinality ID-like string columns are dropped by heuristic.
- For deep learning (CNN/LSTM), extend ml/train.py (not required for the baseline). Start with a feed-forward net if you want to keep it simple.

Research scope ideas
- Compare classical ML (RF, XGBoost) vs DL (FFNN/LSTM) on CICIDS vs UNSW
- Evaluate concept drift via time-split validation
- Adversarial robustness to evasion (feature perturbations)

Security notice
- Do not deploy this unvetted model to monitor sensitive networks. Treat as research/demo only.

---

Docker/Compose quick start (optional)
- Prereqs: Docker + Docker Compose

1) Build and start services
- docker compose up --build
  - Services:
    - mqtt: Eclipse Mosquitto on 1883
    - backend: FastAPI on 8000 (hot reload)
    - dashboard: Vite dev server on 5173

2) Train a model (in container or locally)
- Place CSVs under ml/data/
- Option A (local host):
  - python -m venv .venv && source .venv/bin/activate
  - pip install -r ml/requirements.txt
  - python ml/train.py --data ml/data --nrows 300000 --model-out ml/models/model.joblib
- Option B (inside backend container):
  - docker compose run --rm backend python ml/train.py --data ml/data --nrows 300000 --model-out ml/models/model.joblib

3) Verify
- Backend health: curl http://localhost:8000/health
- Open dashboard: http://localhost:5173 (connects to ws://localhost:8000/ws/alerts)

4) Simulate traffic
- python scripts/replay_to_http.py --csv ml/data/your.csv --rate 25

Environment variables
- Copy .env.example to .env and adjust if needed:
  - MODEL_PATH=ml/models/model.joblib
  - MQTT_BROKER_URL=tcp://mqtt:1883
  - MQTT_TOPIC=ids/traffic
  - VITE_BACKEND_HOST=localhost:8000
