// GPS 러닝 트래킹 화면에서만 쓰는 순수 좌표 계산 유틸(서버 DB 접근 없음, 브라우저에서 그대로 실행).
// 러닝 코스는 도시 내 짧은 구간이라 위경도를 등장방형(Equirectangular) 평면으로 근사해도 오차가
// 무시할 만큼 작다 — 점-선분 최근접점 계산을 구면 기하 없이 벡터 투영만으로 빠르게 처리한다.

const EARTH_RADIUS_M = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function toLocalXY(point: [number, number], originLat: number): [number, number] {
  const [lat, lng] = point;
  const x = toRad(lng) * Math.cos(toRad(originLat)) * EARTH_RADIUS_M;
  const y = toRad(lat) * EARTH_RADIUS_M;
  return [x, y];
}

export function buildCumulativeDistances(positions: [number, number][]): number[] {
  const cumulative = [0];
  for (let i = 1; i < positions.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMeters(positions[i - 1], positions[i]));
  }
  return cumulative;
}

export type SnapResult = {
  point: [number, number];
  distanceAlongM: number;
  distanceFromRouteM: number;
  segmentIndex: number;
};

// 원본 GPS 좌표를 "코스 위에 있다고 가정"하고 코스 경로(route_geom을 촘촘히 이은 폴리라인) 상의
// 가장 가까운 지점으로 보정한다. distanceAlongM은 그 지점까지 코스를 따라온 누적 거리(m).
export function snapToRoute(raw: [number, number], positions: [number, number][], cumulative: number[]): SnapResult | null {
  if (positions.length < 2) return null;
  const originLat = raw[0];
  const p = toLocalXY(raw, originLat);

  let best: SnapResult | null = null;
  let bestDistSq = Infinity;

  for (let i = 0; i < positions.length - 1; i++) {
    const a = toLocalXY(positions[i], originLat);
    const b = toLocalXY(positions[i + 1], originLat);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lenSq = abx * abx + aby * aby;
    let t = lenSq === 0 ? 0 : ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a[0] + abx * t;
    const projY = a[1] + aby * t;
    const dx = p[0] - projX;
    const dy = p[1] - projY;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      const lat = toDeg(projY / EARTH_RADIUS_M);
      const lng = toDeg(projX / (EARTH_RADIUS_M * Math.cos(toRad(originLat))));
      const segLen = Math.sqrt(lenSq);
      const distanceAlongM = cumulative[i] + segLen * t;
      best = { point: [lat, lng], distanceAlongM, distanceFromRouteM: Math.sqrt(distSq), segmentIndex: i };
    }
  }
  return best;
}

export function formatStopwatch(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

// 마라톤 세계기록(약 2:00:35, 42.195km) 기준 페이스가 대략 2분 51초/km다 — 이보다 빠른 기록은
// GPS 오차/스냅 오류로 봐야 한다.
export const IMPOSSIBLE_PACE_SEC_PER_KM = 171;
// 완보(빠르게 걷기) 기준치로 흔히 쓰이는 20분/km보다 느려지면 "도착 버튼을 잊은 것 아닌지" 확인한다.
export const FORGOT_TO_STOP_PACE_SEC_PER_KM = 1200;
