FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OLLAMA_MODEL=qwen2.5:3b-instruct \
    WHISPER_MODEL_SIZE=small.en \
    OLLAMA_HOST=127.0.0.1:11434 \
    HF_HOME=/root/.cache/huggingface \
    PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        ffmpeg \
        libreoffice-impress \
        poppler-utils \
        zstd \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt \
    && python -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8')"

COPY backend /app/backend
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && ollama serve & pid=$!; \
       ready=0; \
       for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
         if curl -sf http://127.0.0.1:11434/api/tags >/dev/null; then ready=1; break; fi; \
         sleep 1; \
       done; \
       test "$ready" = 1; \
       ollama pull qwen2.5:3b-instruct; \
       kill "$pid"; \
       wait "$pid" || true

EXPOSE 8000
CMD ["/entrypoint.sh"]
