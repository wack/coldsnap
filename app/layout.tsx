import type { Metadata } from "next";
import { Pixelify_Sans, Press_Start_2P, VT323 } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

/** Headings and the logo: true 8-bit glyphs, used sparingly. */
const display = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-display" });
/** Body copy and controls: a pixel face that stays readable at small sizes. */
const body = Pixelify_Sans({ subsets: ["latin"], variable: "--font-body" });
/** Machine values (passwords, URLs, model ids): a terminal face. */
const terminal = VT323({ weight: "400", subsets: ["latin"], variable: "--font-terminal" });

export const metadata: Metadata = {
  title: { default: "Coldsnap", template: "%s · Coldsnap" },
  description: "Lead-magnet sites, built by eve and shipped to Vercel.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${display.variable} ${body.variable} ${terminal.variable} font-sans`}>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
