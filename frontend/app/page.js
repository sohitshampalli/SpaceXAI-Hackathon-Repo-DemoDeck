"use client";

import {
  AudioLines,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Presentation,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const PIPELINE = [
  { key: "uploading", label: "Uploading", match: ["queued"], icon: Upload },
  { key: "transcribing", label: "Transcribing", match: ["transcribing"], icon: AudioLines },
  { key: "enriching", label: "Enriching", match: ["enriching"], icon: Building2 },
  { key: "extracting", label: "Extracting pain points", match: ["extracting"], icon: Search },
  { key: "generating", label: "Generating deck", match: ["building", "previewing"], icon: Presentation },
];

const SEVERITY = {
  high: "#FB7185",
  medium: "#FBBF24",
  low: "#9A9AA5",
};

const CATEGORY = {
  cost: "#FBBF24",
  efficiency: "#22D3EE",
  risk: "#FB7185",
  growth: "#34D399",
  compliance: "#7C6AEF",
  other: "#9A9AA5",
};

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function errorMessage(payload) {
  const detail = payload?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const text = detail
      .map((item) => (typeof item === "string" ? item : item?.msg))
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }
  return "Upload was rejected.";
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const finish = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

function Mark({ size = 28, title }) {
  const raw = useId().replace(/:/g, "");
  const grad = `mark-${raw}`;
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={grad} x1="2" y1="26" x2="26" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C6AEF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <path fill={`url(#${grad})`} d="M8 1h10.2L27 9.8V20a7 7 0 0 1-7 7H8a7 7 0 0 1-7-7V8a7 7 0 0 1 7-7z" />
      <path fill="#F5F5F7" fillOpacity="0.42" d="M18.2 1 27 9.8h-4.6A4.2 4.2 0 0 1 18.2 5.6V1z" />
    </svg>
  );
}

function Wordmark({ muted = false, size = 28 }) {
  return (
    <span className="inline-flex items-center gap-3">
      <Mark size={size} />
      <span className={cx("text-[16px] font-semibold tracking-tight", muted ? "text-muted" : "text-text")}>Demo to Deck</span>
    </span>
  );
}

function FieldLabel({ htmlFor, children, optional }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-eyebrow uppercase text-muted">
      {children}
      {optional ? <span className="ml-2 normal-case tracking-normal text-disabled">Optional</span> : null}
    </label>
  );
}

const fieldClass =
  "w-full rounded-control bg-canvas px-3 py-[10px] text-body text-text shadow-card outline-none transition duration-hover ease-hover placeholder:text-disabled hover:bg-surface-hover focus:ring-2 focus:ring-accent/50";

function DropZone({ id, label, hint, accept, file, onFile, previewUrl, durationLabel, warning, audio }) {
  const [hot, setHot] = useState(false);
  const inputRef = useRef(null);

  function take(list) {
    const next = list?.[0];
    if (next) onFile(next);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function onKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  }

  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          setHot(true);
        }}
        onDragLeave={() => setHot(false)}
        onDrop={(event) => {
          event.preventDefault();
          setHot(false);
          take(event.dataTransfer.files);
        }}
        className={cx(
          "rounded-card border border-dashed px-6 py-8 text-center transition duration-hover ease-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          hot ? "border-accent bg-accent/10" : "border-white/20 bg-canvas hover:border-accent/70 hover:bg-surface-hover",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          name={id}
          tabIndex={-1}
          className="sr-only"
          type="file"
          accept={accept}
          onChange={(event) => take(event.target.files)}
        />
        {previewUrl ? (
          <img src={previewUrl} alt="" className="mx-auto mb-4 h-16 max-w-[180px] object-contain" />
        ) : (
          <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-control bg-surface text-accent shadow-card">
            {file && audio ? <AudioLines strokeWidth={1.5} size={18} /> : <Upload strokeWidth={1.5} size={18} />}
          </span>
        )}
        {file ? (
          <p className="font-mono text-body text-text">
            {file.name}
            {durationLabel ? <span className="text-muted"> · {durationLabel}</span> : null}
          </p>
        ) : (
          <p className="text-body text-muted">{hint}</p>
        )}
      </div>
      {file ? (
        <button
          type="button"
          className="mt-3 text-body text-muted underline-offset-2 transition duration-hover ease-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            onFile(null);
          }}
        >
          Remove
        </button>
      ) : null}
      {warning ? (
        <p role="alert" className="mt-3 text-body text-sev-high">
          {warning}
        </p>
      ) : null}
    </div>
  );
}

function ColorField({ id, label, value, onChange }) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-3 rounded-control bg-canvas px-3 py-2 shadow-card transition duration-hover ease-hover hover:bg-surface-hover focus-within:ring-2 focus-within:ring-accent/50">
        <input
          id={id}
          name={id}
          type="color"
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-8 cursor-pointer rounded-control bg-transparent p-0"
        />
        <span className="font-mono text-body uppercase text-muted">{value}</span>
      </div>
    </div>
  );
}

function stepState(status, failed, index) {
  if (status === "done") return "complete";
  const active = PIPELINE.findIndex((step) => step.match.includes(status));
  if (index < active) return "complete";
  if (index === active) return failed ? "failed" : "active";
  return "pending";
}

function Stepper({ status, failed }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {PIPELINE.map((step, index) => {
        const state = stepState(status, failed, index);
        const Icon = state === "complete" ? Check : step.icon;
        return (
            <li
            key={step.key}
            className={cx(
              "rounded-card bg-surface px-4 py-4 shadow-card transition duration-state ease-state",
              state === "active" && "shadow-glow",
              state === "failed" && "ring-1 ring-sev-high/40",
            )}
          >
            <span
              className={cx(
                "mb-4 flex h-8 w-8 items-center justify-center rounded-control",
                state === "complete" && "bg-accent/15 text-accent",
                state === "active" && "bg-accent text-white",
                state === "failed" && "bg-sev-high/15 text-sev-high",
                state === "pending" && "bg-canvas text-disabled",
              )}
              aria-hidden="true"
            >
              <Icon strokeWidth={1.5} size={16} />
            </span>
            <p className={cx("text-body font-medium", state === "pending" ? "text-disabled" : "text-text")}>{step.label}</p>
            <p className="mt-1 text-eyebrow uppercase text-muted">{state === "complete" ? "Done" : state === "active" ? "Now" : state === "failed" ? "Stopped" : "Waiting"}</p>
          </li>
        );
      })}
    </ol>
  );
}

function SkeletonCards() {
  return (
    <div className="mt-8 grid gap-4" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-card bg-surface p-6 shadow-card">
          <div className="skeleton h-3 w-24 rounded-pill" />
          <div className="skeleton mt-4 h-4 w-2/3 rounded-control" />
          <div className="skeleton mt-3 h-3 w-full rounded-control" />
          <div className="skeleton mt-2 h-3 w-5/6 rounded-control" />
        </div>
      ))}
    </div>
  );
}

function Signal({ label, value }) {
  return (
    <div className="rounded-card bg-surface px-4 py-4 shadow-card">
      <p className="text-eyebrow uppercase text-muted">{label}</p>
      <p className="mt-2 text-card text-text">{value}</p>
    </div>
  );
}

export default function HomePage() {
  const formId = useId();
  const [form, setForm] = useState({
    salesperson_name: "",
    company_name: "",
    company_domain: "",
    brand_color_primary: "#17324D",
    brand_color_secondary: "#C46B3A",
  });
  const [audio, setAudio] = useState(null);
  const [audioSeconds, setAudioSeconds] = useState(null);
  const [logo, setLogo] = useState(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [job, setJob] = useState(null);
  const [stage, setStage] = useState("queued");
  const [analysis, setAnalysis] = useState(null);
  const [enrichment, setEnrichment] = useState(null);
  const [preview, setPreview] = useState(null);
  const [modalIndex, setModalIndex] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!logo) {
      setLogoUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(logo);
    setLogoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  useEffect(() => {
    if (!job?.id || job.status === "done" || job.status === "failed") return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/jobs/${job.id}`);
        if (!response.ok) return;
        const next = await response.json();
        if (next.status !== "failed") setStage(next.status);
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
      setModalIndex(null);
    }
    load().catch(() => setError("The deck finished, but the results could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (modalIndex == null) return undefined;
    closeRef.current?.focus();
    function onKey(event) {
      if (event.key === "Escape") setModalIndex(null);
      if (event.key === "ArrowRight") setModalIndex((index) => (index == null ? index : Math.min(index + 1, (preview?.slides?.length || 1) - 1)));
      if (event.key === "ArrowLeft") setModalIndex((index) => (index == null ? index : Math.max(index - 1, 0)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalIndex, preview?.slides?.length]);

  async function chooseAudio(file) {
    setAudio(file);
    setAudioSeconds(null);
    if (!file) return;
    const seconds = await readDuration(file);
    setAudioSeconds(seconds);
  }

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
    if (audioSeconds && audioSeconds > 20 * 60) {
      setError("Audio exceeds the 20 minute limit.");
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
        setError(errorMessage(payload));
        return;
      }
      setStage("queued");
      setJob({ id: payload.job_id, status: "queued", progress: 0, error: null });
    } catch {
      setError("Could not reach the API. Check NEXT_PUBLIC_API_URL.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setJob(null);
    setAnalysis(null);
    setEnrichment(null);
    setPreview(null);
    setModalIndex(null);
    setError("");
    setStage("queued");
  }

  const slides = preview?.slides || [];
  const busy = submitting || (job && job.status !== "done" && job.status !== "failed");
  const hasEnrichment = Boolean(enrichment && (enrichment.verified_description || enrichment.logo_url || enrichment.recent_news_snippet));
  const customer = form.company_name.trim() || analysis?.company_name || "The customer";
  const view = !job ? "upload" : job.status === "done" ? "results" : "processing";
  const pipelineStatus = job?.status === "failed" ? stage : job?.status;
  const deckStyle = {
    "--deck-primary": form.brand_color_primary,
    "--deck-secondary": form.brand_color_secondary,
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header>
        <div className="mx-auto flex h-16 max-w-5xl items-center px-6">
          <Wordmark />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-20">
        {view === "upload" ? (
          <section className="state-enter relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
              style={{
                background: "radial-gradient(closest-side, rgba(124,106,239,0.22), transparent 72%)",
              }}
            />
            <div className="relative">
              <p className="text-eyebrow uppercase text-muted">From the recording</p>
              <h1 className="mt-4 max-w-3xl text-hero-mobile text-text md:text-hero">Turn any sales call into a pitch deck.</h1>
              <p className="mt-6 max-w-xl text-body text-muted">The customer’s words, in your colors. The solve column stays blank.</p>

              <form id={formId} className="mt-16 rounded-card bg-surface p-6 shadow-card md:p-8" onSubmit={onSubmit}>
                <h2 className="text-section text-text">The recording</h2>
                <div className="mt-6">
                  <DropZone
                    id="audio_file"
                    label="Call audio"
                    hint="Drop your call recording or click to browse"
                    accept="audio/*,video/mp4,video/webm"
                    file={audio}
                    audio
                    durationLabel={formatClock(audioSeconds)}
                    warning={audioSeconds > 20 * 60 ? "This recording is longer than 20 minutes." : ""}
                    onFile={chooseAudio}
                  />
                </div>

                <div className="mt-6">
                  <FieldLabel htmlFor="salesperson_name">Salesperson</FieldLabel>
                  <input
                    id="salesperson_name"
                    name="salesperson_name"
                    required
                    value={form.salesperson_name}
                    onChange={(event) => setForm({ ...form, salesperson_name: event.target.value })}
                    className={fieldClass}
                    autoComplete="name"
                  />
                </div>

                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="company_name" optional>
                      Company name
                    </FieldLabel>
                    <input
                      id="company_name"
                      name="company_name"
                      value={form.company_name}
                      onChange={(event) => setForm({ ...form, company_name: event.target.value })}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="company_domain" optional>
                      Company domain
                    </FieldLabel>
                    <input
                      id="company_domain"
                      name="company_domain"
                      placeholder="acme.com"
                      value={form.company_domain}
                      onChange={(event) => setForm({ ...form, company_domain: event.target.value })}
                      className={fieldClass}
                    />
                  </div>
                </div>

                <fieldset className="mt-6">
                  <legend className="mb-4 text-eyebrow uppercase text-muted">Deck colors</legend>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <ColorField
                      id="brand_color_primary"
                      label="Primary"
                      value={form.brand_color_primary}
                      onChange={(value) => setForm({ ...form, brand_color_primary: value })}
                    />
                    <ColorField
                      id="brand_color_secondary"
                      label="Secondary"
                      value={form.brand_color_secondary}
                      onChange={(value) => setForm({ ...form, brand_color_secondary: value })}
                    />
                  </div>
                  <p className="mt-3 text-body text-muted">These colors land on the slides. This page stays indigo.</p>
                </fieldset>

                <div className="mt-6">
                  <DropZone
                    id="logo_file"
                    label="Logo"
                    hint="Drop a PNG, JPG, or WEBP for the title slide"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    file={logo}
                    previewUrl={logoUrl}
                    onFile={setLogo}
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  aria-busy={submitting}
                  className="mt-8 inline-flex w-full items-center justify-center rounded-control bg-accent px-4 py-3 text-button text-white shadow-card transition duration-hover ease-hover hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-disabled disabled:shadow-none"
                >
                  {submitting ? "Uploading" : "Create deck"}
                </button>
                {error ? (
                  <p role="alert" className="mt-4 rounded-control border border-sev-high/30 bg-canvas px-3 py-2 text-body text-sev-high">
                    {error}
                  </p>
                ) : null}
              </form>
            </div>
          </section>
        ) : null}

        {view === "processing" ? (
          <section className="state-enter" aria-live="polite">
            <p className="text-eyebrow uppercase text-muted">Pipeline</p>
            <h1 className="mt-4 text-section text-text">{job?.status === "failed" ? "The deck did not finish" : "Building the deck"}</h1>
            <p className="mt-3 max-w-xl text-body text-muted">
              {customer === "The customer" ? "The call is moving through the local pipeline." : `${customer} is moving through the local pipeline.`}
            </p>
            <div className="mt-8">
              <Stepper status={pipelineStatus} failed={job?.status === "failed"} />
            </div>
            {job?.status === "failed" && job.error ? (
              <p role="alert" className="mt-6 rounded-control border border-sev-high/30 bg-surface px-4 py-3 text-body text-sev-high">
                {job.error}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-4 text-body text-sev-high">
                {error}
              </p>
            ) : null}
            {job?.status !== "failed" ? <SkeletonCards /> : null}
            {job?.status === "failed" ? (
              <button
                type="button"
                onClick={reset}
                className="mt-8 rounded-control bg-surface px-4 py-3 text-button text-text shadow-card transition duration-hover ease-hover hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                Start over
              </button>
            ) : null}
          </section>
        ) : null}

        {view === "results" ? (
          <section className="state-enter" style={deckStyle}>
            <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="check-in mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Check strokeWidth={1.5} size={18} />
                </span>
                <p className="text-eyebrow uppercase text-accent">Deck ready</p>
                <h1 className="mt-3 text-section text-text">{customer}</h1>
                {analysis?.call_summary ? <p className="mt-3 max-w-2xl text-body text-muted">{analysis.call_summary}</p> : null}
              </div>
              <a
                className="inline-flex items-center justify-center gap-2 rounded-control bg-accent px-5 py-3 text-button text-white shadow-card transition duration-hover ease-hover hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                href={`${API_URL}/api/jobs/${job.id}/download`}
              >
                <Download strokeWidth={1.5} size={16} />
                Download deck
              </a>
            </div>

            {preview?.placeholder ? (
              <p className="mt-8 rounded-card bg-surface px-4 py-3 text-body text-muted shadow-card">
                Slide images are placeholders. The download is the real deck.
              </p>
            ) : null}

            {slides.length ? (
              <div className="deck-preview mt-16 rounded-card bg-surface p-4 shadow-card sm:p-6">
                <div className="mb-6 flex gap-2" aria-hidden="true">
                  <div className="h-1 w-16 rounded-pill" style={{ background: "var(--deck-primary)" }} />
                  <div className="h-1 w-6 rounded-pill" style={{ background: "var(--deck-secondary)" }} />
                </div>
                <div className="flex items-end justify-between gap-4">
                  <h2 className="text-section text-text">Slides</h2>
                  <p className="font-mono text-body text-muted">{String(slides.length).padStart(2, "0")}</p>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
                  {slides.map((slide, index) => (
                    <button
                      key={slide.name}
                      type="button"
                      onClick={() => setModalIndex(index)}
                      aria-label={`Open slide ${index + 1}`}
                      className="deck-thumb group overflow-hidden rounded-card bg-canvas text-left shadow-card transition duration-hover ease-hover hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      <img src={`${API_URL}${slide.url}`} alt="" className="aspect-video w-full object-cover" />
                      <span className="block px-3 py-2 font-mono text-[12px] text-muted">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {analysis ? (
              <div className="mt-12">
                <p className="text-eyebrow uppercase text-muted">{analysis.industry_guess}</p>
                <h2 className="mt-3 text-section text-text">Pain points</h2>
                <div className="mt-6 grid gap-4">
                  {(analysis.pain_points || []).map((point) => {
                    const severity = SEVERITY[point.severity] || SEVERITY.medium;
                    const category = CATEGORY[point.category] || CATEGORY.other;
                    return (
                      <article
                        key={point.id}
                        className="rounded-card bg-surface p-6 shadow-card transition duration-hover ease-hover hover:scale-[1.02] hover:bg-surface-hover"
                        style={{ borderLeftWidth: 3, borderLeftColor: severity }}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className="rounded-pill border px-2.5 py-1 text-eyebrow uppercase"
                            style={{ color: severity, borderColor: severity }}
                          >
                            {point.severity}
                          </span>
                          <span className="inline-flex items-center gap-2 text-eyebrow uppercase text-muted">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: category }} />
                            {point.category}
                          </span>
                        </div>
                        <h3 className="mt-4 text-card text-text">{point.title}</h3>
                        <p className="mt-2 text-body text-muted">{point.description}</p>
                        <blockquote className="relative mt-4 rounded-control bg-canvas px-4 py-3 pl-10 text-body text-text shadow-card">
                          <span aria-hidden="true" className="absolute left-3 top-1 text-[28px] leading-none text-accent">
                            “
                          </span>
                          {point.quote}
                        </blockquote>
                      </article>
                    );
                  })}
                </div>

                <h2 className="mt-12 text-section text-text">Buying signals</h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <Signal
                    label="Budget"
                    value={analysis.buying_signals?.budget_mentioned ? analysis.buying_signals.budget_detail || "Mentioned" : "Not mentioned"}
                  />
                  <Signal label="Timeline" value={analysis.buying_signals?.timeline_mentioned || "Not mentioned"} />
                  <Signal label="Decision maker" value={analysis.buying_signals?.decision_maker_present ? "On the call" : "Not confirmed"} />
                </div>

                <h2 className="mt-12 text-section text-text">Objections</h2>
                <div className="mt-6 overflow-hidden rounded-card bg-surface shadow-card">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="px-4 py-3 text-eyebrow font-medium uppercase text-muted">Objection</th>
                        <th className="px-4 py-3 text-eyebrow font-medium uppercase text-muted">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analysis.objections || []).length ? (
                        analysis.objections.map((item) => (
                          <tr key={item.objection} className="border-b border-line last:border-0">
                            <td className="px-4 py-3 text-body text-text">{item.objection}</td>
                            <td className="px-4 py-3 text-body text-muted">{item.handled_on_call ? "Addressed" : "Open"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-4 py-3 text-body text-muted" colSpan={2}>
                            None captured
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <h2 className="mt-12 text-section text-text">Next steps</h2>
                <ol className="mt-6 grid gap-3">
                  {(analysis.next_steps || []).map((step, index) => (
                    <li key={step} className="flex gap-4 rounded-card bg-surface px-4 py-4 shadow-card">
                      <span className="font-mono text-body text-muted">{String(index + 1).padStart(2, "0")}</span>
                      <span className="text-body text-text">{step}</span>
                    </li>
                  ))}
                </ol>

                {analysis.recommended_solution_angle ? (
                  <div className="mt-6 rounded-card bg-surface p-6 shadow-card">
                    <p className="text-eyebrow uppercase text-muted">Suggested angle</p>
                    <p className="mt-3 text-body text-text">{analysis.recommended_solution_angle}</p>
                  </div>
                ) : null}

                {hasEnrichment ? (
                  <div className="mt-12">
                    <h2 className="text-section text-text">Company</h2>
                    <article className="mt-6 rounded-card bg-surface p-6 shadow-card">
                      <div className="flex items-start gap-4">
                        {enrichment.logo_url ? (
                          <img src={enrichment.logo_url} alt="" className="h-12 w-12 rounded-control bg-canvas object-contain p-1 shadow-card" />
                        ) : null}
                        <div>
                          <p className="text-eyebrow uppercase text-muted">{enrichment.source}</p>
                          {enrichment.verified_description ? <p className="mt-3 text-body text-text">{enrichment.verified_description}</p> : null}
                        </div>
                      </div>
                      {enrichment.recent_news_snippet ? (
                        <blockquote className="mt-4 border-l border-line pl-4 text-body text-muted">{enrichment.recent_news_snippet}</blockquote>
                      ) : null}
                    </article>
                  </div>
                ) : null}
              </div>
            ) : (
              <SkeletonCards />
            )}

            <button
              type="button"
              onClick={reset}
              className="mt-16 rounded-control bg-surface px-4 py-3 text-button text-text shadow-card transition duration-hover ease-hover hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              New recording
            </button>
          </section>
        ) : null}
      </main>

      <footer>
        <div className="mx-auto max-w-5xl px-6 pb-12">
          <p className="text-body font-medium text-muted">Demo to Deck</p>
          <p className="mt-1 text-[12px] text-muted">A sales call, returned as a deck.</p>
        </div>
      </footer>

      {modalIndex != null && slides[modalIndex] ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0F]/80 p-4 sm:p-8"
          onClick={() => setModalIndex(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Slide ${modalIndex + 1}`}
            className="deck-preview w-full max-w-5xl rounded-card bg-surface p-4 shadow-card sm:p-6"
            style={deckStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-body text-muted">
                {String(modalIndex + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
              </p>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close preview"
                onClick={() => setModalIndex(null)}
                className="flex h-9 w-9 items-center justify-center rounded-control bg-canvas text-text shadow-card transition duration-hover ease-hover hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X strokeWidth={1.5} size={16} />
              </button>
            </div>
            <img
              src={`${API_URL}${slides[modalIndex].url}`}
              alt={`Slide ${modalIndex + 1} of ${slides.length}`}
              className="w-full rounded-control bg-canvas"
              style={{ boxShadow: "inset 3px 0 0 var(--deck-primary)" }}
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                aria-label="Previous slide"
                disabled={modalIndex === 0}
                onClick={() => setModalIndex((index) => Math.max(0, index - 1))}
                className="inline-flex items-center gap-2 rounded-control bg-canvas px-3 py-2 text-button text-text shadow-card transition duration-hover ease-hover hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:text-disabled"
              >
                <ChevronLeft strokeWidth={1.5} size={16} />
                Previous
              </button>
              <button
                type="button"
                aria-label="Next slide"
                disabled={modalIndex === slides.length - 1}
                onClick={() => setModalIndex((index) => Math.min(slides.length - 1, index + 1))}
                className="inline-flex items-center gap-2 rounded-control bg-canvas px-3 py-2 text-button text-text shadow-card transition duration-hover ease-hover hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:text-disabled"
              >
                Next
                <ChevronRight strokeWidth={1.5} size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
