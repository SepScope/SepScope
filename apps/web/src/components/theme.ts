export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "sepscope-theme";

/**
 * Runs inline in <head> before first paint, so the page never flashes the
 * wrong theme. Kept dependency-free and tolerant of blocked storage.
 */
export const themeInitScript = `(() => {
  let pref = "system";
  try { pref = localStorage.getItem("${THEME_STORAGE_KEY}") || "system"; } catch {}
  const dark = pref === "dark" || (pref !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();`;

export function resolveTheme(pref: ThemePreference, systemDark: boolean): "light" | "dark" {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

export const NEXT_PREFERENCE: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};
