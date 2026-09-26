import "./globals.css";

export const metadata = {
  title: "Demo to Deck",
  description: "Turn a sales call into a customer-specific deck.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
