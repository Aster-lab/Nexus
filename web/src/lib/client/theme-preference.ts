export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCE_STORAGE_KEY = "nexus-theme";

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ThemeRootElement {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  style: { colorScheme: string };
}

export function getBrowserThemeStorage(): ThemeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readThemePreference(storage: Pick<ThemeStorage, "getItem">): ThemePreference {
  try {
    const preference = storage.getItem(THEME_PREFERENCE_STORAGE_KEY);
    return preference === "light" || preference === "dark" ? preference : "system";
  } catch {
    return "system";
  }
}

export function saveThemePreference(
  storage: Pick<ThemeStorage, "setItem">,
  preference: Exclude<ThemePreference, "system">,
): boolean {
  try {
    storage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

export function resolveThemePreference(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

export function applyThemePreference(root: ThemeRootElement, preference: ThemePreference): void {
  if (preference === "system") {
    root.removeAttribute("data-theme");
    root.style.colorScheme = "light dark";
    return;
  }
  root.setAttribute("data-theme", preference);
  root.style.colorScheme = preference;
}

export const THEME_BOOTSTRAP_SCRIPT = `(()=>{try{const t=localStorage.getItem("${THEME_PREFERENCE_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}}catch{}})();`;
