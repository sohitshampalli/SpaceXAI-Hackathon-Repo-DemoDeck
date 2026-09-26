import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "Demo to Deck",
  description: "Turn a raw sales call into a branded, customer-specific deck.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
