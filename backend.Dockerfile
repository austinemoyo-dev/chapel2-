FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TF_CPP_MIN_LOG_LEVEL=3

# Set work directory
WORKDIR /app

# Install system dependencies
# libgl1-mesa-glx and libglib2.0-0 are required by OpenCV/DeepFace
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Create necessary directories for media/static, deepface weights, and logs
RUN mkdir -p /app/staticfiles /app/media /root/.deepface/weights /var/log/chapel

# Download Facenet512 weights to avoid runtime download delay
RUN python -c "\
import requests, pathlib; \
url='https://github.com/serengil/deepface_models/releases/download/v1.0/facenet512_weights.h5'; \
dest=pathlib.Path('/root/.deepface/weights/facenet512_weights.h5'); \
r=requests.get(url, stream=True); \
dest.write_bytes(r.content)"

# Copy project
COPY . /app/

# Expose port 8000
EXPOSE 8000

# Start Gunicorn server (collect static and migrate should be run during CI/CD or startup script, 
# but for simplicity we will run gunicorn directly. We can add a startup script if needed.)
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120", "chapel.wsgi:application"]
