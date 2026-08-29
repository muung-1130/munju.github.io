// Overpass API(OSM)에서 특정 좌표 주변의 공원/체육공원 폴리곤을 찾아 point-in-polygon 테스트에 쓸 수
// 있는 형태로 반환하는 헬퍼. 공원 이름이 붙은 코스가 실제 공원 경계를 벗어나지 않도록 코스 좌표를
// 생성할 때 사용한다.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

async function overpassQuery(query, attempt = 1) {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`
  });
  const text = await res.text();
  if (!res.ok || text.trim().startsWith('<')) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 4000 * attempt));
      return overpassQuery(query, attempt + 1);
    }
    throw new Error(`Overpass 요청 실패: ${res.status} ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

// 폴리곤 좌표 배열([[lat,lng],...])과 점(lat,lng)을 받아 내부 여부를 판정한다 (ray casting).
export function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersects =
      lngI > lng !== lngJ > lng && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonBounds(polygon) {
  const lats = polygon.map((p) => p[0]);
  const lngs = polygon.map((p) => p[1]);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
}

// start 좌표를 포함하는 공원/체육시설 폴리곤을 찾는다. 여러 개가 겹치면 면적이 가장 작은 것을 우선한다
// (전체 한강공원 같은 초대형 폴리곤보다, 실제 코스가 위치한 구체적 공원 구획을 우선하기 위함).
export async function findEnclosingParkPolygon(lat, lng, radiusM = 2500) {
  const query = `[out:json][timeout:25];
(
  way(around:${radiusM},${lat},${lng})["leisure"~"^(park|pitch|track)$"];
  way(around:${radiusM},${lat},${lng})["landuse"="recreation_ground"];
  relation(around:${radiusM},${lat},${lng})["leisure"="park"];
);
out geom;`;
  const data = await overpassQuery(query);
  const candidates = [];
  for (const el of data.elements ?? []) {
    let coords = [];
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      coords = el.geometry.map((pt) => [pt.lat, pt.lon]);
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      for (const member of el.members) {
        if (Array.isArray(member.geometry)) coords.push(...member.geometry.map((pt) => [pt.lat, pt.lon]));
      }
    }
    if (coords.length < 3) continue;
    if (!pointInPolygon(lat, lng, coords)) continue;
    const bounds = polygonBounds(coords);
    const area = (bounds.maxLat - bounds.minLat) * (bounds.maxLng - bounds.minLng);
    candidates.push({ name: el.tags?.name ?? null, polygon: coords, bounds, area });
  }
  candidates.sort((a, b) => a.area - b.area);
  return candidates[0] ?? null;
}
