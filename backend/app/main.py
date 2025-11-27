from __future__ import annotations
import asyncio
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel

MODEL_ENV = os.getenv("MODEL_PATH")
DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[2] / "ml" / "models" / "model.joblib"

app = FastAPI(title="AI IDS Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    features: Dict[str, Any]


class PredictResponse(BaseModel):
    malicious: bool
    score: Optional[float] = None
    timestamp: str


class Alert(BaseModel):
    id: str
    malicious: bool
    score: Optional[float]
    timestamp: str
    features: Dict[str, Any]


class ConnectionManager:
    def __init__(self) -> None:
        self.active: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active:
            self.active.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()
RECENT_ALERTS: List[Alert] = []
RECENT_LIMIT = 200


@app.on_event("startup")
def load_model():
    global model
    model_path = Path(MODEL_ENV) if MODEL_ENV else DEFAULT_MODEL_PATH
    if not model_path.exists():
        app.logger = getattr(app, "logger", None)
        print(f"[WARN] Model file not found at {model_path}. Train and place it there or set MODEL_PATH.")
        model = None
        return
    model = joblib.load(model_path)
    print(f"[INFO] Loaded model from {model_path}")


def predict_from_features(features: Dict[str, Any]) -> tuple[bool, Optional[float]]:
    if model is None:
        # No model: return benign by default
        return False, None
    df = pd.DataFrame([features])
    # Align model pipeline expects training-time columns via ColumnTransformer; it will ignore unknowns if configured
    try:
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(df)
            score = float(proba[:, 1][0])
            return score >= 0.5, score
        else:
            pred = model.predict(df)
            return bool(pred[0] == 1), None
    except Exception as e:
        print(f"[ERROR] Prediction failed: {e}")
        return False, None


@app.get("/", response_class=HTMLResponse)
def root():
    # Simple human-friendly landing page for the API service
    return """
    <html>
      <head><title>AI IDS Backend</title></head>
      <body style='font-family: system-ui, -apple-system, sans-serif; background:#020617; color:#e5e7eb; padding:2rem;'>
        <h1>AI IDS Backend</h1>
        <p>Service is running.</p>
        <ul>
          <li><a href="/health" style='color:#22c55e;'>/health</a> – basic health check</li>
          <li><a href="/docs" style='color:#22c55e;'>/docs</a> – interactive API docs</li>
        </ul>
      </body>
    </html>
    """


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    # Empty icon to avoid noisy 404s in the browser
    return PlainTextResponse("", media_type="image/x-icon")


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    malicious, score = predict_from_features(req.features)
    ts = datetime.utcnow().isoformat() + "Z"
    return PredictResponse(malicious=malicious, score=score, timestamp=ts)


@app.post("/ingest")
async def ingest(req: PredictRequest):
    malicious, score = predict_from_features(req.features)
    ts = datetime.utcnow().isoformat() + "Z"
    alert = Alert(
        id=str(int(datetime.utcnow().timestamp() * 1000)),
        malicious=malicious,
        score=score,
        timestamp=ts,
        features=req.features,
    )
    if malicious:
        RECENT_ALERTS.append(alert)
        if len(RECENT_ALERTS) > RECENT_LIMIT:
            RECENT_ALERTS.pop(0)
        await manager.broadcast(alert.model_dump())
    return {"ingested": True, "malicious": malicious, "score": score, "timestamp": ts}


@app.get("/alerts/recent")
def recent_alerts(limit: int = 50):
    return [a.model_dump() for a in RECENT_ALERTS[-limit:]]


@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send a hello message
        await websocket.send_json({"type": "hello", "message": "connected"})
        while True:
            # Keep the connection alive; we don't expect client messages (ignore)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


# Optional: MQTT subscriber
MQTT_URL = os.getenv("MQTT_BROKER_URL")  # e.g., tcp://localhost:1883
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "ids/traffic")

try:
    import paho.mqtt.client as mqtt  # type: ignore
except Exception:
    mqtt = None  # type: ignore


async def _handle_mqtt_payload(payload: bytes):
    try:
        data = json.loads(payload.decode("utf-8"))
        if isinstance(data, dict):
            await ingest(PredictRequest(features=data))
        else:
            print("[WARN] MQTT payload not a dict JSON; ignored")
    except Exception as e:
        print(f"[WARN] Failed to parse MQTT payload: {e}")


def _start_mqtt():
    if not MQTT_URL or mqtt is None:
        return

    def on_connect(client, userdata, flags, rc):
        print(f"[INFO] MQTT connected rc={rc}; subscribing to {MQTT_TOPIC}")
        client.subscribe(MQTT_TOPIC)

    def on_message(client, userdata, msg):
        asyncio.run(_handle_mqtt_payload(msg.payload))

    client = mqtt.Client()
    # Support tcp://host:port
    url = MQTT_URL
    if url.startswith("tcp://"):
        rest = url[len("tcp://"):]
        host, port = rest.split(":")
        host = host.strip()
        port = int(port)
        client.on_connect = on_connect
        client.on_message = on_message
        client.connect(host, port, 60)
        client.loop_start()
        print("[INFO] MQTT loop started")


@app.on_event("startup")
def maybe_start_mqtt():
    _start_mqtt()
