"use client";

import { useEffect, useId, useRef, useState } from "react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const STEPS = [
  { id: "queued", label: "Queued", detail: "Waiting to start" },
  { id: "transcribing", label: "Transcribing", detail: "Listening to the call locally" },
  { id: "enriching", label: "Enriching", detail: "Checking public company info" },
  { id: "extracting", label: "Extracting", detail: "Pulling pain points on this machine" },
  { id: "building", label: "Building deck", detail: "Laying out the branded slides" },
  { id: "previewing", label: "Rendering preview", detail: "Turning slides into images" },
];

const SEVERITY_STYLE = {
  high: "bg-red-50 text-red-800 ring-red-200",
  medium: "bg-amber-50 text-amber-900 ring-amber-200",
  low: "bg-emerald-50 text-emerald-800 ring-emerald-200",
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

function DropZone({ id, label, hint, accept, file, onFile, previewUrl, durationLabel, warning }) {
  const [hot, setHot] = useState(false);
  const inputRef = useRef(null);

  function take(list) {
    const next = list?.[0];
    if (next) onFile(next);
  }

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div
        className={cx(
          "rounded-2xl border-2 border-dashed px-4 py-5 text-center transition",
          hot ? "border-copper bg-orange-50" : "border-slate-300 bg-[#fbfaf7]",
        )}
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
      >
        <input
          ref={inputRef}
          id={id}
          name={id}
          className="sr-only"
          type="file"
          accept={accept}
          onChange={(event) => take(event.target.files)}
        />
        {previewUrl ? (
          <img src={previewUrl} alt="Uploaded logo preview" className="mx-auto mb-3 h-16 max-w-[180px] object-contain" />
        ) : null}
        {file ? (
          <p className="text-sm font-medium text-ink">
            {file.name}
            {durationLabel ? <span className="font-normal text-slate-500"> · {durationLabel}</span> : null}
          </p>
        ) : (
          <p className="text-sm text-slate-600">{hint}</p>
        )}
        <button
          type="button"
          className="mt-3 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          onClick={() => inputRef.current?.click()}
        >
          {file ? "Replace file" : "Browse"}
        </button>
        {file ? (
          <button
            type="button"
            className="ml-2 text-sm text-slate-500 underline-offset-2 hover:underline"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              onFile(null);
            }}
          >
            Remove
          </button>
        ) : null}
      </div>
      {warning ? <p className="mt-2 text-sm text-red-700">{warning}</p> : null}
    </div>
  );
}

function ColorField({ id, label, value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="color"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
      />
      <span className="inline-flex h-11 min-w-[4.5rem] items-center justify-center rounded-lg px-2 text-xs font-semibold text-white" style={{ background: value }}>
        {label}
      </span>
      <span className="font-mono text-xs uppercase tracking-wide text-slate-500">{value}</span>
    </div>
  );
}

function Stepper({ status, failed, progress }) {
  const activeIndex = STEPS.findIndex((step) => step.id === status);
  const done = status === "done";
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <p className="font-medium text-ink" aria-live="polite">
          {done ? "Deck ready" : failed ? "Could not finish the deck" : STEPS[activeIndex]?.label || "Working"}
        </p>
        <p className="tabular-nums text-slate-500">{progress ?? 0}%</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress || 0}>
        <div
          className="h-full rounded-full bg-copper transition-all duration-700 ease-out"
          style={{ width: `${Math.min(progress || 0, 100)}%` }}
        />
      </div>
      <ol className="mt-5 space-y-3">
        {STEPS.map((step, index) => {
          const complete = done || (activeIndex > -1 && index < activeIndex);
          const current = !done && !failed && index === activeIndex;
          const broken = failed && index === activeIndex;
          return (
            <li key={step.id} className="flex items-start gap-3">
              <span
                className={cx(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  complete && "bg-navy text-white",
                  current && "step-live bg-copper text-white",
                  broken && "bg-red-700 text-white",
                  !complete && !current && !broken && "bg-slate-200 text-slate-500",
                )}
                aria-hidden="true"
              >
                {complete ? "✓" : index + 1}
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">{step.label}</span>
                <span className="block text-sm text-slate-500">{step.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
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
  const [slideIndex, setSlideIndex] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      setSlideIndex(0);
    }
    load().catch(() => setError("The deck finished, but the results could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, [job?.id, job?.status]);

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

  const slides = preview?.slides || [];
  const currentSlide = slides[slideIndex];
  const busy = submitting || (job && job.status !== "done" && job.status !== "failed");
  const hasEnrichment = Boolean(
    enrichment && (enrichment.verified_description || enrichment.logo_url || enrichment.recent_news_snippet),
  );
  const customer = form.company_name.trim() || "Your customer";

  function moveSlide(delta) {
    if (!slides.length) return;
    setSlideIndex((index) => (index + delta + slides.length) % slides.length);
  }

  return (
    <div>
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <p className="text-sm font-semibold tracking-tight">Demo to Deck</p>
          <p className="text-sm text-white/70">Runs locally · No hosted LLM</p>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper">Sales leave-behind</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Turn a raw sales call into a branded, customer-specific deck.
          </h1>
        </div>
      </header>

      <main className="mx-auto -mt-8 grid max-w-6xl gap-6 px-5 pb-16 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
        <form id={formId} className="rounded-3xl bg-white p-5 shadow-card sm:p-6" onSubmit={onSubmit}>
          <DropZone
            id="audio_file"
            label="Sales call"
            hint="Drop a recording here, up to 20 minutes."
            accept="audio/*,video/mp4,video/webm"
            file={audio}
            durationLabel={formatClock(audioSeconds)}
            warning={audioSeconds > 20 * 60 ? "This recording is longer than 20 minutes." : ""}
            onFile={chooseAudio}
          />

          <label htmlFor="salesperson_name" className="mb-2 mt-5 block text-sm font-medium text-slate-700">
            Salesperson
          </label>
          <input
            id="salesperson_name"
            name="salesperson_name"
            required
            value={form.salesperson_name}
            onChange={(event) => setForm({ ...form, salesperson_name: event.target.value })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-navy focus:ring-2"
            autoComplete="name"
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div>
              <label htmlFor="company_name" className="mb-2 block text-sm font-medium text-slate-700">
                Company name <span className="font-normal text-slate-400">optional</span>
              </label>
              <input
                id="company_name"
                name="company_name"
                value={form.company_name}
                onChange={(event) => setForm({ ...form, company_name: event.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-navy focus:ring-2"
              />
            </div>
            <div>
              <label htmlFor="company_domain" className="mb-2 block text-sm font-medium text-slate-700">
                Company domain <span className="font-normal text-slate-400">optional</span>
              </label>
              <input
                id="company_domain"
                name="company_domain"
                placeholder="acme.com"
                value={form.company_domain}
                onChange={(event) => setForm({ ...form, company_domain: event.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-navy focus:ring-2"
              />
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className="mb-3 text-sm font-medium text-slate-700">Brand colors</legend>
            <div className="space-y-3">
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
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <div className="h-2" style={{ background: form.brand_color_primary }} />
              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: form.brand_color_secondary }}>
                  Opportunity brief
                </p>
                <p className="mt-1 text-lg font-semibold" style={{ color: form.brand_color_primary }}>
                  {customer}
                </p>
              </div>
            </div>
          </fieldset>

          <div className="mt-5">
            <DropZone
              id="logo_file"
              label="Logo, optional"
              hint="Drop a PNG, JPG, or WEBP. It lands on the title slide."
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
            className="mt-6 w-full rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? "Uploading…" : busy ? "Building the deck…" : "Create deck"}
          </button>
          {error ? (
            <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </form>

        <section className="min-w-0 space-y-6" aria-label="Deck progress and results">
          {!job ? (
            <div className="rounded-3xl bg-white p-6 shadow-card">
              <h2 className="text-lg font-semibold">What you get back</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>A title slide in your colors, with the customer name and logo.</li>
                <li>Pain points the customer actually said, each with the quote.</li>
                <li>A solution table whose “How we solve it” column is left blank.</li>
              </ul>
            </div>
          ) : null}

          {job ? (
            <div className="rounded-3xl bg-white p-6 shadow-card">
              <Stepper
                status={job.status === "failed" ? stage : job.status}
                failed={job.status === "failed"}
                progress={job.progress}
              />
              {job.status === "failed" && job.error ? (
                <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {job.error}
                </p>
              ) : null}
              {job.status === "done" ? (
                <a
                  className="mt-5 inline-flex rounded-full bg-copper px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                  href={`${API_URL}/api/jobs/${job.id}/download`}
                >
                  Download deck
                </a>
              ) : null}
            </div>
          ) : null}

          {preview?.placeholder ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Preview images are placeholders because slide rasterization was unavailable. The download is still the real deck.
            </p>
          ) : null}

          {currentSlide ? (
            <div className="rounded-3xl bg-white p-4 shadow-card sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Slides</h2>
                <p className="text-sm tabular-nums text-slate-500">
                  {slideIndex + 1} / {slides.length}
                </p>
              </div>
              <div className="relative">
                <img
                  src={`${API_URL}${currentSlide.url}`}
                  alt={`Slide ${slideIndex + 1} of ${slides.length}`}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                    onClick={() => moveSlide(-1)}
                    aria-label="Previous slide"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                    onClick={() => moveSlide(1)}
                    aria-label="Next slide"
                  >
                    Next
                  </button>
                </div>
              </div>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {slides.map((slide, index) => (
                  <button
                    key={slide.name}
                    type="button"
                    aria-label={`Show slide ${index + 1}`}
                    aria-current={index === slideIndex}
                    onClick={() => setSlideIndex(index)}
                    className={cx(
                      "w-24 shrink-0 overflow-hidden rounded-lg border-2",
                      index === slideIndex ? "border-copper" : "border-transparent",
                    )}
                  >
                    <img src={`${API_URL}${slide.url}`} alt="" className="h-14 w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {analysis ? (
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-6 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper">{analysis.industry_guess}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{analysis.company_name || customer}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-700">{analysis.call_summary}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Signal label="Budget" value={analysis.buying_signals?.budget_mentioned ? analysis.buying_signals.budget_detail || "Mentioned" : "Not mentioned"} />
                <Signal label="Timeline" value={analysis.buying_signals?.timeline_mentioned || "Not mentioned"} />
                <Signal label="Decision maker" value={analysis.buying_signals?.decision_maker_present ? "On the call" : "Not confirmed"} />
              </div>

              <div className="grid gap-4">
                {(analysis.pain_points || []).map((point) => (
                  <article key={point.id} className="rounded-3xl bg-white p-5 shadow-card">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ring-1", SEVERITY_STYLE[point.severity] || SEVERITY_STYLE.medium)}>
                        {point.severity}
                      </span>
                      <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-copper">
                        {point.category}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold">{point.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{point.description}</p>
                    <blockquote className="mt-4 border-l-4 border-copper pl-4 text-sm italic leading-6 text-slate-600">
                      “{point.quote}”
                    </blockquote>
                  </article>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl bg-white p-5 shadow-card">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Objections</h3>
                  <ul className="mt-3 space-y-3 text-sm">
                    {(analysis.objections || []).length ? (
                      analysis.objections.map((item) => (
                        <li key={item.objection}>
                          <p className="text-ink">{item.objection}</p>
                          <p className="text-slate-500">{item.handled_on_call ? "Addressed on the call" : "Still open"}</p>
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-500">None captured.</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-3xl bg-white p-5 shadow-card">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Next steps</h3>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
                    {(analysis.next_steps || []).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-5 shadow-card">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Suggested angle</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">{analysis.recommended_solution_angle}</p>
              </div>

              <div className="rounded-3xl bg-white p-5 shadow-card">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Company enrichment</h3>
                {hasEnrichment ? (
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-wide text-copper">{enrichment.source}</p>
                    {enrichment.verified_description ? <p>{enrichment.verified_description}</p> : null}
                    {enrichment.recent_news_snippet ? <p>Recently: {enrichment.recent_news_snippet}</p> : null}
                    {enrichment.logo_url ? <p className="break-all text-slate-500">Logo: {enrichment.logo_url}</p> : null}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">No public company profile was attached. The deck still uses the call.</p>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function Signal({ label, value }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
