import Link from "next/link";

export function Tabs({
  tabs,
  active,
  basePath,
  extraQuery,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  basePath: string;
  /** Extra query params to preserve across tab links, e.g. { service: "dir-marathon" } */
  extraQuery?: Record<string, string>;
}) {
  const query = new URLSearchParams(extraQuery);

  return (
    <div className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border)" }}>
      {tabs.map((t) => {
        const params = new URLSearchParams(query);
        params.set("tab", t.id);
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={`${basePath}?${params.toString()}`}
            className="-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium"
            style={{
              borderColor: isActive ? "var(--series-1)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
