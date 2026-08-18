export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${className}`}
      style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}
    >
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
