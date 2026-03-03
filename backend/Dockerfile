# ---- Backend Dockerfile ----
FROM python:3.12-slim

WORKDIR /app

# System deps for building native extensions
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY pyproject.toml ./
RUN pip install --no-cache-dir . && \
    pip install --no-cache-dir uvicorn[standard]

# Pre-download the sentence-transformer model so cold starts are fast
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Copy app code
COPY app/ ./app/

# Data volume — Railway mounts persistent storage here
# SQLite DB + project files will live under /app/data
ENV DATA_DIR=/app/data

# Railway sets PORT automatically; default to 8000
ENV PORT=8000

EXPOSE ${PORT}

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
