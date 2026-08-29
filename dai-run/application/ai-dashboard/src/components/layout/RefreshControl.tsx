"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const AUTO_REFRESH_MS = 30_000;
const TICK_MS = 1000;
// router.refresh() has no completion callback, so a fixed spinner window both
// gives feedback and guarantees the button can never get stuck disabled if
// the underlying RSC round-trip errors out.
const SPINNER_MS = 1200;

/** A ticking clock via useSyncExternalStore — setState-in-effect is disallowed,
 *  but subscribing to an external "clock" ticking on an interval is exactly
 *  the documented escape hatch for this. */
function subscribeToClock(callback: () => void) {
  const id = setInterval(callback, TICK_MS);
  return () => clearInterval(id);
}
function getClockSnapshot() {
  return Date.now();
}
function getClockServerSnapshot() {
  return 0;
}
function useNow(): number {
  return useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockServerSnapshot);
}

function formatElapsed(lastRefreshedAt: number | null, nowMs: number): string {
  if (lastRefreshedAt === null || nowMs === 0) return "";
  const sec = Math.max(0, Math.round((nowMs - lastRefreshedAt) / 1000));
  if (sec < 5) return "방금 갱신";
  if (sec < 60) return `${sec}초 전 갱신`;
  return `${Math.floor(sec / 60)}분 전 갱신`;
}

/**
 * Server Components fetch live Prometheus/Loki/Tempo/DB (MELT) data at
 * request time — router.refresh() re-runs them without a full page
 * navigation. This is the only way to see updated "LIVE" values short of
 * reloading the page, so it's surfaced explicitly rather than left implicit.
 *
 * Deliberately does NOT use useTransition: router.refresh()'s pending state
 * has no guaranteed reset if the RSC round-trip itself errors, which can
 * leave a transition-driven spinner disabled forever. A plain state + fixed
 * timeout can't get stuck the same way, and every timer here is started
 * from an event handler (click / checkbox toggle), never from an effect
 * body, so react-hooks/set-state-in-effect never applies.
 */
export function RefreshControl() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const nowMs = useNow();
  const spinnerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = () => {
    setLastRefreshedAt(Date.now());
    setIsRefreshing(true);
    if (spinnerTimer.current) clearTimeout(spinnerTimer.current);
    spinnerTimer.current = setTimeout(() => setIsRefreshing(false), SPINNER_MS);
    try {
      router.refresh();
    } catch (err) {
      console.error("MELT 새로고침 요청 실패:", err);
    }
  };

  const toggleAutoRefresh = (checked: boolean) => {
    setAutoRefresh(checked);
    if (autoTimer.current) {
      clearInterval(autoTimer.current);
      autoTimer.current = null;
    }
    if (checked) {
      autoTimer.current = setInterval(refresh, AUTO_REFRESH_MS);
    }
  };

  // Cleanup only — no setState here, so this is exempt from
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    return () => {
      if (spinnerTimer.current) clearTimeout(spinnerTimer.current);
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs tabular sm:inline" style={{ color: "var(--text-muted)" }}>
        {formatElapsed(lastRefreshedAt, nowMs)}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={isRefreshing}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium disabled:opacity-60"
        style={{ background: "var(--surface-page)", color: "var(--text-secondary)" }}
        aria-label="MELT 실측 데이터 새로고침"
        title="Prometheus·Loki·Tempo·DB 등에서 최신 값을 다시 조회합니다"
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            animation: isRefreshing ? "dairun-spin 0.7s linear infinite" : undefined,
          }}
        >
          ↻
        </span>
        새로고침
      </button>
      <label className="hidden items-center gap-1.5 text-xs md:flex" style={{ color: "var(--text-muted)" }}>
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => toggleAutoRefresh(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        자동 30초
      </label>
    </div>
  );
}
