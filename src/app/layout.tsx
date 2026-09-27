import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bebas_Neue, DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-dm-sans",
  display: "swap",
});

const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Oktoberfest sales",
  description: "Internal sales screen for Nashville Oktoberfest 2026.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable} ${bebas.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
