#!/bin/sh
set -eu

ollama serve &
ready=0
i=0
while [ "$i" -lt 60 ]; do
  if curl -sf http://127.0.0.1:11434/api/tags >/dev/null; then
    ready=1
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "Ollama did not become ready" >&2
  exit 1
fi

cd /app/backend
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
