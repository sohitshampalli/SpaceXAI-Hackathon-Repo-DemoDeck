# Demo to Deck

Upload a raw sales call. Get back a branded, customer-specific PowerPoint deck.

Transcription uses **faster-whisper** on this machine. Pain-point extraction uses **Ollama** on `localhost:11434`. Neither stage calls a hosted LLM. Firecrawl and Exa are used only for optional company enrichment, and a missing key or a failed request becomes null fields instead of a failed job.

## What you get

1. `POST /api/jobs` accepts the recording and returns `202` with a `job_id`.
2. The job transcribes, enriches, extracts up to four pain points, builds `deck.pptx`, and renders slide previews.
3. Raw audio is deleted as soon as transcription finishes.
4. The deck is a title slide, a call summary, one slide per pain point (max four), a solution-mapping slide with blank "how we solve it" lines, a value/ROI slide, and next steps. Headlines use `brand_color_primary`. Tags and dividers use `brand_color_secondary`.

The shipped template is six slides with shapes named `title_text`, `body_text`, and `quote_text`. Extra pain points duplicate the pain-point slide. Nothing is filled by slide index.

## Local setup

System packages:

```bash
sudo apt-get install -y ffmpeg libreoffice-impress poppler-utils
```

Install Ollama from [ollama.com](https://ollama.com), start it, and pull a model:

```bash
ollama serve
ollama pull llama3.1:8b          # local default
ollama pull qwen2.5:3b-instruct  # model baked into the Render image
```

Confirm `curl http://127.0.0.1:11434/api/tags` answers before starting the API.

Python:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

`backend/.env` is gitignored. Fill `FIRECRAWL_API_KEY` and `EXA_API_KEY` only if you want live enrichment. Leave them blank and the job still completes.

| Variable | Purpose |
| --- | --- |
| `MAX_AUDIO_MINUTES` | Reject uploads longer than this at ingest time. Default 20. |
| `MAX_UPLOAD_MB` | Reject larger uploads. Default 100. |
| `OLLAMA_MODEL` | Local chat model. Default `llama3.1:8b`. Render should use `qwen2.5:3b-instruct`. |
| `WHISPER_MODEL_SIZE` | CPU whisper size. Default `small.en`. A CUDA GPU switches the code to `medium.en`. |
| `FIRECRAWL_API_KEY` | Homepage scrape. Optional. |
| `EXA_API_KEY` | One news search. Optional. |
| `CORS_ORIGINS` | Comma-separated browser origins, or `*`. |

Start the API from `backend/` so imports resolve:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000` when `.env.local` is missing. Open `http://localhost:3000`.

### curl

```bash
curl -sS -X POST http://localhost:8000/api/jobs \
  -F "audio_file=@/absolute/path/to/call.wav" \
  -F "salesperson_name=Alex Morgan" \
  -F "brand_color_primary=#17324D" \
  -F "brand_color_secondary=#B8612F" \
  -F "company_name=Northwind Logistics" \
  -F "company_domain=northwindlogistics.com"
```

Poll `GET /api/jobs/{job_id}` until `status` is `done` or `failed`. Then:

- `GET /api/jobs/{job_id}/analysis`
- `GET /api/jobs/{job_id}/enrichment`
- `GET /api/jobs/{job_id}/preview`
- `GET /api/jobs/{job_id}/download`

## Enrichment

If a company domain was provided, or the transcript contains a URL or an explicit company attribution, enrichment runs in parallel and never raises:

- **Firecrawl** scrapes the homepage for a short description and a logo URL found in the HTML.
- **Exa** runs one `POST /search` (`type: auto`, `contents.highlights: true`) for `{company} recent news OR funding OR announcement`, limited with `start_published_date` to the last six months. The deck uses the top result's title and one highlight line.

`source` is `firecrawl` when a description or logo came back, otherwise `exa` when only news came back, otherwise `none`. A downloaded logo is used only when the request did not include `logo_file`.

## Models

CPU transcription uses `small.en` with int8. Set `OLLAMA_MODEL` to compare extractors. `llama3.1:8b` is the local default. `qwen2.5:3b-instruct` is what the container pulls at image build time so a cold start does not re-download weights. See the notes at the bottom of this file after a local run for which model returned cleaner JSON.

## Render

Deploy the backend as a **Docker web service** on the **Pro Plus** instance (8 GB RAM, 4 CPU). Ollama, faster-whisper `small.en`, and `qwen2.5:3b-instruct` all sit in one container. The Dockerfile pulls `qwen2.5:3b-instruct` during `docker build`, so cold starts do not download it again.

`render.yaml` is the blueprint: plan `pro_plus`, health check `GET /health`, `OLLAMA_MODEL=qwen2.5:3b-instruct`.

In the Render dashboard:

1. New Web Service, connect this repo, environment **Docker**. The Dockerfile path is `./Dockerfile`.
2. Instance type **Pro Plus** (8 GB RAM). Pro (4 GB) is too tight for Ollama plus Whisper plus LibreOffice at the same time.
3. Set environment variables: `OLLAMA_MODEL=qwen2.5:3b-instruct`, `WHISPER_MODEL_SIZE=small.en`, `MAX_AUDIO_MINUTES=20`, `MAX_UPLOAD_MB=100`, `CORS_ORIGINS` to the Netlify origin (or `*`), plus `FIRECRAWL_API_KEY` and `EXA_API_KEY` if you want enrichment.
4. Deploy. The first build is large because it downloads the model weights.

This repository was prepared for that deploy. Actually publishing the service requires a Render account and was not done from this workspace.

## Netlify

The frontend is a Next.js app in `frontend/`.

- Base directory: `frontend`
- Build command: `npm run build`
- Plugin: `@netlify/plugin-nextjs` (already listed in `netlify.toml`)
- Environment variable: `NEXT_PUBLIC_API_URL=https://<your-render-service>.onrender.com`

`netlify.toml` sets the base directory and build command. Point `CORS_ORIGINS` on Render at the resulting Netlify origin. Publishing to Netlify was not done from this workspace.

## Measured locally

These numbers are from this workspace: 4 vCPU, 15 GB RAM, no GPU. The clip was a 4.9 minute synthetic English sales call made with espeak-ng and kept outside the repo. `FIRECRAWL_API_KEY` and `EXA_API_KEY` were unset, so enrichment returned nulls (`source: none`) and the job still finished. Raw audio was deleted after transcription.

| Run | What ran | Time |
| --- | --- | --- |
| Full pipeline, qwen cold | `qwen2.5:3b-instruct` | 98.4 s |
| Full pipeline, qwen already loaded | `qwen2.5:3b-instruct` | 106.9 s |
| Extraction only | `llama3.1:8b` | 150.0 s |

On the 98.4 s run, transcription plus enrichment finished in about 24 s, extraction took about 70 s, and the deck plus previews took about 4 s. A direct qwen generation of the same transcript was 578 output tokens in 45.5 s, plus about 11 s to score the prompt. llama3.1:8b produced 560 tokens in 108 s of generation after a 32 s prompt pass. Neither full run landed under 90 seconds on this machine.

**Cleaner JSON: `qwen2.5:3b-instruct`.** It kept the stated project budget ($80,000 this fiscal year), a quarter-end timeline, and longer quotes that are present in the transcript. `llama3.1:8b` also returned valid JSON, but it stored the budget as the "$20 million book" (the size of the book of business, not the project budget) and labeled the forecast miss as compliance. Its recommended angle stayed closer to the Dallas pilot that was actually discussed. Both models marked the implementation objection as still open even though the rep proposed a phased pilot. Whisper also mishears some espeak phrases, so a quote can be verbatim to the transcript and still not match the original script.

Live Firecrawl and Exa calls were not tested. The missing-key path was.

Render and Netlify were not deployed from this workspace.

## Known limitations

- There is no speaker diarization. The extractor infers who is talking from the undivided transcript.
- Solution slides leave "How we solve it" blank on purpose. The model is not allowed to invent product claims.
- `soffice --headless --convert-to png` only writes the first slide. The preview step still runs that command, then converts the deck through PDF and `pdftoppm` so every slide has a PNG. If `soffice` is missing, the API draws an explicit placeholder contact sheet, sets `preview_placeholder` on the job, and still marks the deck `done`.
- Job status lives in memory. Restarting the API drops the status map even if files remain under `/tmp/jobs`.
- Enrichment logs a warning and continues when keys are absent or either vendor errors.
