# Backend Dockerfile
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first (better layer caching)
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy source
COPY backend /app/backend
COPY ml /app/ml

# Build a small demo model so the service is ready out-of-the-box
# Uses the included synthetic CSV; if it fails, don't block the build
RUN python /app/ml/train.py --data /app/ml/data/synthetic.csv --nrows 200 --model-out /app/ml/models/model.joblib || true

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
