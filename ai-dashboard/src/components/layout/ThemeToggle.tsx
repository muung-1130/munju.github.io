"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): Theme {
  const stored = document.documentElement.dataset.theme;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("dairun-theme", next);
  } catch {
    // localStorage unavailable (private mode, etc.) — theme still applies for this session
  }
  listeners.forEach((l) => l());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
      className="rounded-full px-2.5 py-1.5 text-xs font-medium"
      style={{ background: "var(--surface-page)", color: "var(--text-secondary)" }}
      aria-label="테마 전환"
    >
      {theme === "dark" ? "🌙 다크" : "☀️ 라이트"}
    </button>
  );
}
