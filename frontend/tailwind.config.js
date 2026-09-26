/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        paper: "#f4f1ea",
        copper: "#c46b3a",
        navy: "#17324d",
      },
      boxShadow: {
        card: "0 18px 50px rgba(16, 24, 40, 0.08)",
      },
    },
  },
  plugins: [],
};
