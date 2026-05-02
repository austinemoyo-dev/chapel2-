FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Silence OpenCV and ONNX Runtime console noise
ENV OPENCV_LOG_LEVEL=ERROR
ENV ORT_LOGGING_LEVEL=3

WORKDIR /app

# System dependencies
# - libpq-dev        : PostgreSQL client (psycopg2)
# - libgl1 + libglib : OpenCV headless image I/O (InsightFace)
# - libgomp1         : OpenMP — required by ONNX Runtime CPU kernels
# - libstdc++6       : C++ standard library needed by ONNX Runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (layer cached until requirements.txt changes)
COPY requirements.txt /app/
RUN pip install --upgrade pip --no-cache-dir && \
    pip install --no-cache-dir -r requirements.txt

# Create runtime directories
RUN mkdir -p /app/staticfiles /app/media /root/.insightface /var/log/chapel

# Pre-warm InsightFace buffalo_l models so the first request is not slow.
# Models are downloaded to /root/.insightface and persisted via the
# insightface_models Docker volume defined in docker-compose.yml.
# Total download: ~500 MB. Use buffalo_s (~90 MB) for a lighter image.
RUN python -c " \
from insightface.app import FaceAnalysis; \
app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); \
app.prepare(ctx_id=0, det_size=(640, 640)); \
print('InsightFace buffalo_l pre-loaded successfully.') \
" || echo "InsightFace pre-warm skipped (will load on first request)."

# Copy project source
COPY . /app/

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "180", "chapel.wsgi:application"]
