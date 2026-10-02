import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { themeInitScript } from "@/components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SEPscope", template: "%s · SEPscope" },
  description: "Health, compliance, and uptime of Stellar anchors.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets data-theme before hydration, so the attribute legitimately differs.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              SEPscope
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
