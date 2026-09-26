# Demo to Deck API

FastAPI service for the local transcription, enrichment, extraction, deck, and preview pipeline. Full install steps, the Render Pro Plus tier, the Netlify build command, and the curl example are in the [repository README](../README.md).

Run it from this directory after copying `.env.example` to `.env`:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

```bash
curl -sS -X POST http://localhost:8000/api/jobs \
  -F "audio_file=@/absolute/path/to/call.wav" \
  -F "salesperson_name=Alex Morgan" \
  -F "brand_color_primary=#17324D" \
  -F "brand_color_secondary=#B8612F" \
  -F "company_name=Northwind Logistics" \
  -F "company_domain=northwindlogistics.com"
```

Ollama must already be listening on `127.0.0.1:11434`. `OLLAMA_MODEL` selects the local extractor (`llama3.1:8b` for local dev, `qwen2.5:3b-instruct` on Render). Transcription and extraction never call a hosted LLM.
