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

export function StatCard({ label, value, suffix, icon }: { label: string; value: string; suffix?: string; icon: string }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
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
          <stop offset="0" stopColor="#2f6bff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[20,55,90,125].map((y) => <line key={y} x1="10" x2="410" y1={y} y2={y} stroke="#dbe6fb" strokeDasharray="5 6" />)}
      <path d="M15 105 L50 72 L88 98 L125 86 L160 118 L198 75 L238 93 L282 68 L323 82 L370 45 L408 91 L408 145 L15 145 Z" fill="url(#lineFill)" />
      <polyline points="15,105 50,72 88,98 125,86 160,118 198,75 238,93 282,68 323,82 370,45 408,91" fill="none" stroke="#1259ee" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {[15,50,88,125,160,198,238,282,323,370,408].map((x, i) => {
        const y = [105,72,98,86,118,75,93,68,82,45,91][i];
        return <circle key={x} cx={x} cy={y} r="5" fill="#fff" stroke="#1259ee" strokeWidth="3" />;
      })}
    </svg>
  );
}

const hourlyHours = ['지금', '12시', '15시', '18시', '21시', '24시', '03시'];
const hourlyTemps = [18, 21, 23, 20, 17, 15, 13];
const hourlyIcons = ['🌤️', '☀️', '☀️', '🌤️', '🌥️', '🌙', '🌙'];

export function HourlyWeatherChart() {
  const width = 900;
  const chartTop = 64;
  const chartBottom = 148;
  const padX = 36;
  const usableWidth = width - padX * 2;
  const stepX = usableWidth / (hourlyHours.length - 1);
  const minT = Math.min(...hourlyTemps);
  const maxT = Math.max(...hourlyTemps);
  const range = maxT - minT || 1;
  const yFor = (t: number) => chartBottom - ((t - minT) / range) * (chartBottom - chartTop);
  const points = hourlyTemps.map((t, i) => [padX + i * stepX, yFor(t)] as [number, number]);
  const linePoints = points.map((p) => p.join(',')).join(' ');
  const areaPath = `M${points[0][0]},${chartBottom} ${points.map((p) => `L${p[0]},${p[1]}`).join(' ')} L${points[points.length - 1][0]},${chartBottom} Z`;

  return (
    <svg className="hourly-weather-chart" viewBox={`0 0 ${width} 190`} role="img" aria-label="시간대별 날씨 그래프">
      <defs>
        <linearGradient id="hourlyFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2f6bff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[chartTop, (chartTop + chartBottom) / 2, chartBottom].map((y) => (
        <line key={y} x1={padX} x2={width - padX} y1={y} y2={y} stroke="#dbe6fb" strokeDasharray="5 6" />
      ))}
      <path d={areaPath} fill="url(#hourlyFill)" />
      <polyline points={linePoints} fill="none" stroke="#1259ee" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <g key={hourlyHours[i]}>
          <circle cx={x} cy={y} r="5" fill="#fff" stroke="#1259ee" strokeWidth="3" />
          <text x={x} y="30" textAnchor="middle" fontSize="22">{hourlyIcons[i]}</text>
          <text x={x} y={y - 14} textAnchor="middle" fontSize="15" fontWeight="800" fill="#0e2a54">{hourlyTemps[i]}°</text>
          <text x={x} y="178" textAnchor="middle" fontSize="13" fontWeight="700" fill="#64748b">{hourlyHours[i]}</text>
        </g>
      ))}
    </svg>
  );
}

export function Donut({ value = 62, label = '62%' }: { value?: number; label?: string }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * (value / 100);
  return (
    <svg className="donut" viewBox="0 0 120 120" role="img" aria-label="진행률">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#e7edf8" strokeWidth="16" />
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#1056e8" strokeWidth="16" strokeDasharray={`${dash} ${circumference - dash}`} strokeLinecap="round" transform="rotate(-90 60 60)" />
      <text x="60" y="66" textAnchor="middle" fontSize="24" fontWeight="800" fill="#071633">{label}</text>
    </svg>
  );
}
