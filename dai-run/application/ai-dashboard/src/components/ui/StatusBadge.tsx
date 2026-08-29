import type { ServiceStatus } from "@/lib/types";

const STATUS_META: Record<ServiceStatus, { label: string; color: string; icon: string }> = {
  healthy: { label: "정상", color: "var(--status-good)", icon: "●" },
  warning: { label: "주의", color: "var(--status-warning)", icon: "▲" },
  critical: { label: "심각", color: "var(--status-critical)", icon: "■" },
};

export function StatusBadge({ status, className = "" }: { status: ServiceStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
      style={{
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 14%, transparent)`,
      }}
    >
      <span aria-hidden style={{ fontSize: 8 }}>
        {meta.icon}
      </span>
      {meta.label}
    </span>
  );
}

export function statusColor(status: ServiceStatus): string {
  return STATUS_META[status].color;
}

export function statusLabel(status: ServiceStatus): string {
  return STATUS_META[status].label;
}
