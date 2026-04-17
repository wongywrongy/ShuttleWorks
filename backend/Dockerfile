# Backend Dockerfile - Stateless API
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy scheduler_core from src (needed for schedule generation)
COPY src/scheduler_core ./scheduler_core
COPY src/app ./src/app
COPY src/adapters ./src/adapters

# Copy backend application code
COPY backend/app/ ./app/
COPY backend/api/ ./api/
COPY backend/services/ ./services/

# Directory for the tournament state file — mounted as a Docker volume in
# production so state survives container recreation.
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
