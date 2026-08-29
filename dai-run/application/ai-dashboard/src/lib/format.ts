export function compactNumber(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
}

export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min = 0;
  }
  const range = niceNumber(max - min, false);
  const step = niceNumber(range / (count - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}

function niceNumber(range: number, round: boolean): number {
  if (range === 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

export function formatMinuteOffset(t: number): string {
  if (t === 0) return "now";
  return `${t}m`;
}

export function formatBytesPerSec(bytesPerSec: number): string {
  if (bytesPerSec >= 1_000_000) return `${(bytesPerSec / 1_000_000).toFixed(1)}MB/s`;
  if (bytesPerSec >= 1_000) return `${(bytesPerSec / 1_000).toFixed(1)}KB/s`;
  return `${Math.round(bytesPerSec)}B/s`;
}

export function formatTimeAgo(minutesAgo: number): string {
  if (minutesAgo < 1) return "지금";
  if (minutesAgo < 60) return `${minutesAgo}분 전`;
  const h = Math.floor(minutesAgo / 60);
  const m = minutesAgo % 60;
  return m ? `${h}시간 ${m}분 전` : `${h}시간 전`;
}
