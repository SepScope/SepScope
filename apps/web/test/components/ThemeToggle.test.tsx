import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_STORAGE_KEY, themeInitScript } from "@/components/theme";
import { mockMatchMedia } from "../helpers/fixtures";

const theme = () => document.documentElement.dataset.theme;

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("starts on System and cycles to Light, Dark and back, remembering the choice", async () => {
    mockMatchMedia(true);
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("System");
    expect(theme()).toBe("dark");

    await userEvent.click(button);
    expect(button).toHaveTextContent("Light");
    expect(theme()).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    await userEvent.click(button);
    expect(button).toHaveAccessibleName("Theme: Dark. Switch to System.");
    expect(theme()).toBe("dark");

    await userEvent.click(button);
    expect(button).toHaveTextContent("System");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("restores a saved preference", () => {
    mockMatchMedia(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveTextContent("Light");
    expect(theme()).toBe("light");
  });

  it("on System, follows the OS setting as it changes", () => {
    const media = mockMatchMedia(false);
    const { unmount } = render(<ThemeToggle />);
    expect(theme()).toBe("light");
    media.setDark(true);
    expect(theme()).toBe("dark");
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it("still works when storage is blocked", async () => {
    mockMatchMedia(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button"));
    expect(theme()).toBe("light");
  });
});

describe("themeInitScript", () => {
  const run = () => new Function(themeInitScript)();

  it.each([
    [null, true, "dark"],
    [null, false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
  ])("with saved %s and OS dark=%s, sets %s before paint", (saved, osDark, expected) => {
    mockMatchMedia(osDark);
    if (saved) localStorage.setItem(THEME_STORAGE_KEY, saved);
    run();
    expect(theme()).toBe(expected);
  });

  it("falls back to the OS setting when storage is blocked", () => {
    mockMatchMedia(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    run();
    expect(theme()).toBe("dark");
  });
});
