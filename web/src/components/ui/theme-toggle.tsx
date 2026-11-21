"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyThemePreference,
  getBrowserThemeStorage,
  readThemePreference,
  resolveThemePreference,
  saveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "../../lib/client/theme-preference";

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    let active = true;
    const storage = getBrowserThemeStorage();
    const savedPreference = storage ? readThemePreference(storage) : "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyThemePreference(document.documentElement, savedPreference);
    queueMicrotask(() => {
      if (!active) return;
      setPreference(savedPreference);
      setResolvedTheme(resolveThemePreference(savedPreference, media.matches));
    });

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (savedPreference === "system") setResolvedTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", handleSystemThemeChange);
    return () => { active = false; media.removeEventListener("change", handleSystemThemeChange); };
  }, []);

  function toggleTheme() {
    const currentTheme = preference === "system"
      ? resolveThemePreference("system", systemPrefersDark())
      : preference;
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    const storage = getBrowserThemeStorage();
    if (storage) saveThemePreference(storage, nextTheme);
    applyThemePreference(document.documentElement, nextTheme);
    setPreference(nextTheme);
    setResolvedTheme(nextTheme);
  }

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="nexus-theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      {resolvedTheme === "dark" ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
      <span className="nexus-theme-toggle__label">{resolvedTheme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
