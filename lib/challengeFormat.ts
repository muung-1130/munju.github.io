// challenge.challenges/challenge_participations의 수치 컬럼에는 단위 접미사가 없어(스펙 그대로),
// metric_type별 단위를 다음과 같이 가정한다: DISTANCE -> km, PACE -> sec/km, STREAK -> 일, COUNT -> 회.
// 서버(lib/challenges.ts)와 클라이언트 컴포넌트 양쪽에서 그대로 쓸 수 있도록 DB 접근 없는
// 순수 모듈로 분리했다 — lib/challenges.ts는 pg를 쓰므로 클라이언트 컴포넌트에서 바로 import하면 안 된다.
export type MetricType = 'DISTANCE' | 'COUNT' | 'PACE' | 'STREAK';
export type ChallengeType = 'PERSONAL' | 'PUBLIC' | 'CREW';

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatPace(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}'${String(sec).padStart(2, '0')}"/km`;
}

export function formatMetricValue(metricType: MetricType, value: number): string {
  switch (metricType) {
    case 'DISTANCE':
      return `${trimNumber(value)}km`;
    case 'PACE':
      return formatPace(value);
    case 'STREAK':
      return `${trimNumber(value)}일`;
    case 'COUNT':
      return `${trimNumber(value)}회`;
    default:
      return `${value}`;
  }
}

export function metricLabel(metricType: MetricType): string {
  switch (metricType) {
    case 'DISTANCE':
      return '거리';
    case 'PACE':
      return '페이스';
    case 'STREAK':
      return '연속일';
    case 'COUNT':
      return '횟수';
    default:
      return metricType;
  }
}
