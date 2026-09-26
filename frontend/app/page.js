"use client";

import { useEffect, useState } from "react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const STATUS_LABEL = {
  queued: "Queued",
  transcribing: "Transcribing on this machine",
  enriching: "Checking public company info",
  extracting: "Extracting pain points locally",
  building: "Building the deck",
  previewing: "Rendering slide previews",
  done: "Deck ready",
  failed: "Failed",
};

export default function HomePage() {
  const [form, setForm] = useState({
    salesperson_name: "",
    company_name: "",
    company_domain: "",
    brand_color_primary: "#17324D",
    brand_color_secondary: "#B8612F",
  });
  const [audio, setAudio] = useState(null);
  const [logo, setLogo] = useState(null);
  const [job, setJob] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [enrichment, setEnrichment] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!job?.id || job.status === "done" || job.status === "failed") return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/jobs/${job.id}`);
        if (!response.ok) return;
        const next = await response.json();
        setJob(next);
      } catch {
        setError("Lost contact with the API while polling.");
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (job?.status !== "done") return undefined;
    let cancelled = false;
    async function load() {
      const [analysisResponse, enrichmentResponse, previewResponse] = await Promise.all([
        fetch(`${API_URL}/api/jobs/${job.id}/analysis`),
        fetch(`${API_URL}/api/jobs/${job.id}/enrichment`),
        fetch(`${API_URL}/api/jobs/${job.id}/preview`),
      ]);
      if (cancelled) return;
      if (analysisResponse.ok) setAnalysis(await analysisResponse.json());
      if (enrichmentResponse.ok) setEnrichment(await enrichmentResponse.json());
      if (previewResponse.ok) setPreview(await previewResponse.json());
    }
    load().catch(() => setError("The deck finished, but the results could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, [job?.id, job?.status]);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setAnalysis(null);
    setEnrichment(null);
    setPreview(null);
    if (!audio) {
      setError("Choose a sales-call recording first.");
      return;
    }
    const body = new FormData();
    body.append("audio_file", audio);
    body.append("salesperson_name", form.salesperson_name);
    body.append("brand_color_primary", form.brand_color_primary);
    body.append("brand_color_secondary", form.brand_color_secondary);
    if (form.company_name) body.append("company_name", form.company_name);
    if (form.company_domain) body.append("company_domain", form.company_domain);
    if (logo) body.append("logo_file", logo);
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/jobs`, { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.detail === "string" ? payload.detail : "Upload was rejected.");
        return;
      }
      setJob({ id: payload.job_id, status: "queued", progress: 0, error: null });
    } catch {
      setError("Could not reach the API. Check NEXT_PUBLIC_API_URL.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app">
      <header>
        <h1>Demo to Deck</h1>
        <p>
          Upload a sales call. Pain points are transcribed and extracted on the server with
          faster-whisper and Ollama. The deck comes back branded for that customer.
        </p>
      </header>
      <div className="layout">
        <form className="card" onSubmit={onSubmit}>
          <label htmlFor="audio_file">Sales call audio</label>
          <input id="audio_file" name="audio_file" type="file" accept="audio/*,video/mp4,video/webm" onChange={(event) => setAudio(event.target.files?.[0] || null)} required />

          <label htmlFor="salesperson_name">Salesperson name</label>
          <input id="salesperson_name" name="salesperson_name" type="text" value={form.salesperson_name} onChange={(event) => setForm({ ...form, salesperson_name: event.target.value })} required />

          <label htmlFor="company_name">Company name (optional)</label>
          <input id="company_name" name="company_name" type="text" value={form.company_name} onChange={(event) => setForm({ ...form, company_name: event.target.value })} />

          <label htmlFor="company_domain">Company domain (optional)</label>
          <input id="company_domain" name="company_domain" type="text" placeholder="acme.com" value={form.company_domain} onChange={(event) => setForm({ ...form, company_domain: event.target.value })} />

          <div className="colors">
            <div>
              <label htmlFor="brand_color_primary">Primary</label>
              <input id="brand_color_primary" name="brand_color_primary" type="color" value={form.brand_color_primary} onChange={(event) => setForm({ ...form, brand_color_primary: event.target.value })} />
            </div>
            <div>
              <label htmlFor="brand_color_secondary">Secondary</label>
              <input id="brand_color_secondary" name="brand_color_secondary" type="color" value={form.brand_color_secondary} onChange={(event) => setForm({ ...form, brand_color_secondary: event.target.value })} />
            </div>
          </div>

          <label htmlFor="logo_file">Logo (optional)</label>
          <input id="logo_file" name="logo_file" type="file" accept="image/*" onChange={(event) => setLogo(event.target.files?.[0] || null)} />

          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? "Uploading…" : "Create deck"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <section className="card">
          {!job ? <p>Submit a recording to start a job. Progress updates every two seconds.</p> : null}
          {job ? (
            <>
              <p className="status">
                {STATUS_LABEL[job.status] || job.status} · {job.progress ?? 0}%
              </p>
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${job.progress || 0}%` }} />
              </div>
              {job.error ? <p className="error">{job.error}</p> : null}
            </>
          ) : null}

          {job?.status === "done" ? (
            <a className="download" href={`${API_URL}/api/jobs/${job.id}/download`}>
              Download deck
            </a>
          ) : null}

          {preview?.placeholder ? (
            <p>Preview images are placeholders because slide rasterization was unavailable. The download is still the real deck.</p>
          ) : null}

          {preview?.slides?.length ? (
            <div className="slides">
              {preview.slides.map((slide) => (
                <img key={slide.name} src={`${API_URL}${slide.url}`} alt={slide.name} />
              ))}
            </div>
          ) : null}

          {enrichment ? (
            <div className="pain">
              <div className="tag">Company enrichment · {enrichment.source}</div>
              <p>{enrichment.verified_description || "No verified company description."}</p>
              {enrichment.recent_news_snippet ? <p>Recently: {enrichment.recent_news_snippet}</p> : null}
            </div>
          ) : null}

          {analysis ? (
            <div>
              <h2>{analysis.company_name || "Customer"} · {analysis.industry_guess}</h2>
              <p>{analysis.call_summary}</p>
              {(analysis.pain_points || []).map((point) => (
                <article className="pain" key={point.id}>
                  <div className="tag">{point.category} · {point.severity}</div>
                  <h3>{point.title}</h3>
                  <p>{point.description}</p>
                  <blockquote>{point.quote}</blockquote>
                </article>
              ))}
              <div className="pain">
                <div className="tag">Buying signals</div>
                <p>
                  Budget: {analysis.buying_signals?.budget_mentioned ? analysis.buying_signals.budget_detail || "mentioned" : "not mentioned"}
                  . Timeline: {analysis.buying_signals?.timeline_mentioned || "not mentioned"}
                  . Decision maker present: {analysis.buying_signals?.decision_maker_present ? "yes" : "no"}.
                </p>
                <p>{analysis.recommended_solution_angle}</p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
