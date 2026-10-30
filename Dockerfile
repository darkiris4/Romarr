FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim AS python-builder
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt

FROM python:3.12-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN groupadd --gid 1000 romarr \
    && useradd --uid 1000 --gid 1000 --no-create-home --shell /usr/sbin/nologin romarr

COPY --from=python-builder /opt/venv /opt/venv
COPY backend/ backend/
COPY --from=frontend-builder /build/dist frontend/dist

RUN mkdir -p /app/data /app/library \
    && chown romarr:romarr /app/data /app/library

ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH=/app/backend
ENV DATABASE_URL=sqlite:////app/data/romarr.db
ENV DATA_DIR=/app/data
ENV ROM_LIBRARY_PATH=/app/library

USER romarr

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health', timeout=4)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
