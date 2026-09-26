/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0A0A0F",
        surface: "#14141C",
        "surface-hover": "#191922",
        line: "rgba(255,255,255,0.08)",
        text: "#F5F5F7",
        muted: "#9A9AA5",
        disabled: "#55555F",
        accent: "#7C6AEF",
        cyan: "#22D3EE",
        "sev-high": "#FB7185",
        "sev-medium": "#FBBF24",
        "sev-low": "#9A9AA5",
        "cat-cost": "#FBBF24",
        "cat-efficiency": "#22D3EE",
        "cat-risk": "#FB7185",
        "cat-growth": "#34D399",
        "cat-compliance": "#7C6AEF",
        "cat-other": "#9A9AA5",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        hero: ["56px", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "600" }],
        "hero-mobile": ["36px", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "600" }],
        section: ["24px", { lineHeight: "1.2", fontWeight: "600" }],
        card: ["16px", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["14px", { lineHeight: "1.6", fontWeight: "400" }],
        eyebrow: ["11px", { lineHeight: "1.4", letterSpacing: "0.08em", fontWeight: "500" }],
        button: ["14px", { lineHeight: "1.2", fontWeight: "500" }],
      },
      borderRadius: {
        card: "16px",
        control: "10px",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 1px 1px rgba(0,0,0,0.28), 0 16px 40px -16px rgba(0,0,0,0.65)",
        glow: "0 0 0 1px rgba(124,106,239,0.45), 0 16px 40px -16px rgba(0,0,0,0.65)",
      },
      transitionDuration: {
        hover: "150ms",
        state: "300ms",
      },
      transitionTimingFunction: {
        hover: "ease",
        state: "ease-out",
      },
    },
  },
  plugins: [],
};
