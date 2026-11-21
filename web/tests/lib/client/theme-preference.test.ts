import { describe, expect, it, vi } from "vitest";
import {
  applyThemePreference,
  getBrowserThemeStorage,
  readThemePreference,
  resolveThemePreference,
  saveThemePreference,
  THEME_PREFERENCE_STORAGE_KEY,
} from "../../../src/lib/client/theme-preference";

function createThemeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    style: { colorScheme: "" },
    setAttribute: vi.fn((name: string, value: string) => attributes.set(name, value)),
    removeAttribute: vi.fn((name: string) => attributes.delete(name)),
  };
}

describe("WP9 light and dark theme preference", () => {
  it("defaults to system preference and ignores invalid saved values", () => {
    expect(readThemePreference({ getItem: () => null })).toBe("system");
    expect(readThemePreference({ getItem: () => "auto-dark" })).toBe("system");
  });

  it("reads and saves explicit preferences under one non-sensitive key", () => {
    const storage = { getItem: vi.fn(() => "dark"), setItem: vi.fn() };
    expect(readThemePreference(storage)).toBe("dark");
    saveThemePreference(storage, "light");
    expect(storage.setItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY, "light");
  });

  it("falls back safely when browser storage is unavailable", () => {
    expect(readThemePreference({ getItem: () => { throw new Error("storage blocked"); } })).toBe("system");
    expect(saveThemePreference({ setItem: () => { throw new Error("storage blocked"); } }, "dark")).toBe(false);
    expect(getBrowserThemeStorage()).toBeNull();
  });

  it("resolves system preference and applies explicit theme to document root", () => {
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");

    const root = createThemeRoot();
    applyThemePreference(root, "dark");
    expect(root.attributes.get("data-theme")).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");

    applyThemePreference(root, "system");
    expect(root.attributes.has("data-theme")).toBe(false);
    expect(root.style.colorScheme).toBe("light dark");
  });
});
