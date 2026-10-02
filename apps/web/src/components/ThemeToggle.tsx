"use client";

import { useEffect, useState, type JSX } from "react";
import { NEXT_PREFERENCE, resolveTheme, THEME_STORAGE_KEY, type ThemePreference } from "./theme";

const LABEL: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };
const ICON: Record<ThemePreference, JSX.Element> = {
  system: (
    <>
      <rect x="2.5" y="3.5" width="11" height="8" rx="1" />
      <path d="M6 14h4M8 11.5V14" />
    </>
  ),
  light: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
    </>
  ),
  dark: <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" />,
};

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** Cycles System → Light → Dark. "System" follows the OS setting, including live changes. */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference | null>(null);

  useEffect(() => setPref(readPreference()), []);

  useEffect(() => {
    if (pref === null) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => (document.documentElement.dataset.theme = resolveTheme(pref, media.matches));
    apply();
    try {
      if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [pref]);

  const current = pref ?? "system";
  return (
    <button
      type="button"
      onClick={() => setPref(NEXT_PREFERENCE[current])}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      aria-label={`Theme: ${LABEL[current]}. Switch to ${LABEL[NEXT_PREFERENCE[current]]}.`}
      title="Change theme"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICON[current]}
      </svg>
      {LABEL[current]}
    </button>
  );
}
