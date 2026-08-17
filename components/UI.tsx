import type { ReactNode } from 'react';

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="page-title-row">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`card ${className}`}>{children}</section>;
}

export function StatCard({ label, value, suffix, icon }: { label: string; value: string; suffix?: string; icon?: string }) {
  return (
    <div className="stat-card">
      {icon && <div className="stat-icon">{icon}</div>}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>{suffix && <em>{suffix}</em>}
      </div>
    </div>
  );
}

export function MiniLineChart() {
  return (
    <svg className="mini-line" viewBox="0 0 420 150" role="img" aria-label="페이스 추이 그래프">
      <defs>
        <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#74BDEB" stopOpacity="0.22" />
          <stop offset="1" stopColor="#74BDEB" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[20,55,90,125].map((y) => <line key={y} x1="10" x2="410" y1={y} y2={y} stroke="#CFE9FF" strokeDasharray="5 6" />)}
      <path d="M15 105 L50 72 L88 98 L125 86 L160 118 L198 75 L238 93 L282 68 L323 82 L370 45 L408 91 L408 145 L15 145 Z" fill="url(#lineFill)" />
      <polyline points="15,105 50,72 88,98 125,86 160,118 198,75 238,93 282,68 323,82 370,45 408,91" fill="none" stroke="#74BDEB" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {[15,50,88,125,160,198,238,282,323,370,408].map((x, i) => {
        const y = [105,72,98,86,118,75,93,68,82,45,91][i];
        return <circle key={x} cx={x} cy={y} r="5" fill="#fff" stroke="#74BDEB" strokeWidth="3" />;
      })}
    </svg>
  );
}

export function Donut({ value = 62, label = '62%' }: { value?: number; label?: string }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * (value / 100);
  return (
    <svg className="donut" viewBox="0 0 120 120" role="img" aria-label="진행률">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#CFE9FF" strokeWidth="16" />
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#74BDEB" strokeWidth="16" strokeDasharray={`${dash} ${circumference - dash}`} strokeLinecap="round" transform="rotate(-90 60 60)" />
      <text x="60" y="66" textAnchor="middle" fontSize="24" fontWeight="800" fill="#3C6E71">{label}</text>
    </svg>
  );
}
