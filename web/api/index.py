from __future__ import annotations
import asyncio
import json
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel

# ─── Database Setup ─────────────────────────────────────────────────────────
# Default: SQLite (no credentials needed, file-based, production-ready for small scale)
# Override with DATABASE_URL env var for PostgreSQL:
#   DATABASE_URL=postgresql://user:password@host:5432/dbname
DATABASE_URL = os.getenv("DATABASE_URL", "")
DB_FILE = Path(__file__).resolve().parent / "data" / "reports.db"
DB_FILE.parent.mkdir(parents=True, exist_ok=True)

_db_lock = threading.Lock()


def _get_sqlite_conn():
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    """Create tables if they don't exist."""
    with _db_lock:
        conn = _get_sqlite_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS reports (
                id          TEXT PRIMARY KEY,
                filename    TEXT NOT NULL,
                uploaded_at TEXT NOT NULL,
                total       INTEGER DEFAULT 0,
                malicious   INTEGER DEFAULT 0,
                benign      INTEGER DEFAULT 0,
                avg_score   REAL DEFAULT 0,
                accuracy    REAL,
                precision_v REAL,
                f1_score    REAL,
                recall      REAL,
                status      TEXT DEFAULT 'complete'
            );

            CREATE TABLE IF NOT EXISTS report_rows (
                id          TEXT PRIMARY KEY,
                report_id   TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                row_index   INTEGER,
                malicious   INTEGER,
                score       REAL,
                features    TEXT,
                timestamp   TEXT,
                FOREIGN KEY (report_id) REFERENCES reports(id)
            );
        """)
        conn.commit()
        conn.close()


_init_db()

MODEL_ENV = os.getenv("MODEL_PATH")
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "models" / "model.joblib"
model = None

app = FastAPI(title="AI IDS Backend", version="0.1.0", root_path="/api")
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
    print(f"[DEBUG] Received DF columns: {df.columns.tolist()}")
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
        import traceback
        traceback.print_exc()
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


@app.get("/model/info")
def model_info():
    """Return real metadata extracted from the loaded model pipeline."""
    if model is None:
        return {"model_loaded": False}

    info: Dict[str, Any] = {"model_loaded": True}

    # Walk through Pipeline steps to find the classifier
    steps = getattr(model, "steps", [])
    clf = None
    for _, step in steps:
        if hasattr(step, "predict"):
            clf = step
            break
    if clf is None:
        clf = model  # model itself might be the classifier

    info["estimator_type"] = type(clf).__name__

    # For ensemble models expose sub-estimator count
    if hasattr(clf, "n_estimators"):
        info["n_estimators"] = clf.n_estimators
    if hasattr(clf, "estimators_"):
        info["fitted_estimators"] = len(clf.estimators_)

    # Classes
    if hasattr(clf, "classes_"):
        info["classes"] = clf.classes_.tolist()
        info["n_classes"] = len(clf.classes_)

    # Feature importances (top 10)
    if hasattr(clf, "feature_importances_"):
        fi = clf.feature_importances_.tolist()
        info["n_features"] = len(fi)
        # Try to get feature names from schema
        schema_path = Path(__file__).resolve().parent.parent.parent / "ml" / "models" / "schema.json"
        if schema_path.exists():
            import json as _json
            schema = _json.loads(schema_path.read_text())
            numeric_cols = schema.get("numeric_cols", [])
            categorical_cols = schema.get("categorical_cols", [])
            all_cols = numeric_cols + categorical_cols
            if len(all_cols) == len(fi):
                top_features = sorted(zip(all_cols, fi), key=lambda x: -x[1])[:5]
                info["top_features"] = [{"name": n, "importance": round(v, 4)} for n, v in top_features]

    # Load metrics if saved alongside model
    metrics_path = Path(__file__).resolve().parent / "models" / "metrics.json"
    if metrics_path.exists():
        import json as _json
        info["metrics"] = _json.loads(metrics_path.read_text())

    return info


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


# ─── Reports API ─────────────────────────────────────────────────────────────

class ReportRowIn(BaseModel):
    row_index: int
    malicious: bool
    score: Optional[float] = None
    features: Dict[str, Any]
    timestamp: str


class SaveReportRequest(BaseModel):
    filename: str
    total: int
    malicious: int
    benign: int
    avg_score: float
    accuracy: Optional[float] = None
    precision_v: Optional[float] = None
    f1_score: Optional[float] = None
    recall: Optional[float] = None
    rows: List[ReportRowIn] = []


@app.post("/reports/save")
def save_report(req: SaveReportRequest):
    """Save a CSV analysis report to the database."""
    report_id = str(uuid.uuid4())
    uploaded_at = datetime.utcnow().isoformat() + "Z"

    with _db_lock:
        conn = _get_sqlite_conn()
        try:
            conn.execute(
                """INSERT INTO reports
                   (id, filename, uploaded_at, total, malicious, benign, avg_score,
                    accuracy, precision_v, f1_score, recall, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete')""",
                (report_id, req.filename, uploaded_at, req.total, req.malicious,
                 req.benign, req.avg_score, req.accuracy, req.precision_v,
                 req.f1_score, req.recall)
            )
            for row in req.rows:
                conn.execute(
                    """INSERT INTO report_rows
                       (id, report_id, row_index, malicious, score, features, timestamp)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (str(uuid.uuid4()), report_id, row.row_index,
                     int(row.malicious), row.score,
                     json.dumps(row.features), row.timestamp)
                )
            conn.commit()
        finally:
            conn.close()

    return {"id": report_id, "uploaded_at": uploaded_at}


@app.get("/reports")
def list_reports(limit: int = 50, offset: int = 0):
    """List all saved reports (newest first)."""
    with _db_lock:
        conn = _get_sqlite_conn()
        try:
            rows = conn.execute(
                """SELECT id, filename, uploaded_at, total, malicious, benign,
                          avg_score, accuracy, precision_v, f1_score, recall, status
                   FROM reports
                   ORDER BY uploaded_at DESC
                   LIMIT ? OFFSET ?""",
                (limit, offset)
            ).fetchall()
            total_count = conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
        finally:
            conn.close()

    return {
        "total": total_count,
        "reports": [dict(r) for r in rows]
    }


@app.get("/reports/{report_id}")
def get_report(report_id: str):
    """Get a single report with all its rows."""
    with _db_lock:
        conn = _get_sqlite_conn()
        try:
            report = conn.execute(
                "SELECT * FROM reports WHERE id = ?", (report_id,)
            ).fetchone()
            if not report:
                raise HTTPException(status_code=404, detail="Report not found")
            rows = conn.execute(
                """SELECT row_index, malicious, score, features, timestamp
                   FROM report_rows WHERE report_id = ? ORDER BY row_index""",
                (report_id,)
            ).fetchall()
        finally:
            conn.close()

    parsed_rows = []
    for r in rows:
        d = dict(r)
        try:
            d["features"] = json.loads(d["features"])
        except Exception:
            pass
        parsed_rows.append(d)

    return {**dict(report), "rows": parsed_rows}


@app.delete("/reports/{report_id}")
def delete_report(report_id: str):
    """Delete a report and all its rows."""
    with _db_lock:
        conn = _get_sqlite_conn()
        try:
            result = conn.execute(
                "DELETE FROM reports WHERE id = ?", (report_id,)
            )
            conn.execute(
                "DELETE FROM report_rows WHERE report_id = ?", (report_id,)
            )
            conn.commit()
        finally:
            conn.close()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"deleted": True}
