import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ptm-theme";
export const SIDEBAR_STORAGE_KEY = "ptm-sidebar-collapsed";

/**
 * Runs in <head> before first paint so the stored theme applies without a flash.
 * The server always renders data-theme="light"; this corrects it on the client.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the change still applies for this page.
  }
}

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Current theme from <html data-theme>, plus a toggle that persists it. */
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as const);
  const toggle = useCallback(() => {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    writeStorage(THEME_STORAGE_KEY, next);
    notify();
  }, []);
  return [theme, toggle];
}

/** Sidebar collapsed state (icon rail), persisted across visits. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const isCollapsed = useSyncExternalStore(subscribe, readSidebarCollapsed, () => false);
  const toggle = useCallback(() => {
    writeStorage(SIDEBAR_STORAGE_KEY, String(!readSidebarCollapsed()));
    notify();
  }, []);
  return [isCollapsed, toggle];
}
