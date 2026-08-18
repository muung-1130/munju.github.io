"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICES } from "@/lib/mock";

/** Client-side jump-to-service search — SERVICES is a static list (no
 * network fetch), so filtering it here is cheap and instant. */
export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SERVICES.filter((s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)).slice(0, 6);
  }, [query]);

  const goTo = (id: string) => {
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    router.push(`/services/${id}`);
  };

  return (
    <div className="relative hidden w-full max-w-xs lg:block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }} aria-hidden>
        ⌕
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) goTo(matches[0].id);
        }}
        placeholder="서비스 검색…"
        className="w-full rounded-full py-2 pl-9 pr-3 text-sm outline-none"
        style={{ background: "var(--surface-page)", color: "var(--text-primary)" }}
      />
      {open && matches.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-10 mt-1.5 overflow-hidden rounded-xl border p-1"
          style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}
        >
          {matches.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => goTo(s.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:opacity-80"
                style={{ color: "var(--text-primary)" }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: "var(--brand)" }}
                  aria-hidden
                >
                  {s.label.slice(0, 1)}
                </span>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
