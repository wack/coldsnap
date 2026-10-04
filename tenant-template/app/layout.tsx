import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: process.env.COLDSNAP_SITE_NAME ?? "Welcome",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={body.variable}>{children}</body>
    </html>
  );
}
