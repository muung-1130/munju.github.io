// 무료 공개 Nominatim(OSM) 지오코딩 API를 쓰는 서버 전용 헬퍼.
// 브라우저에서 직접 호출하지 않고 API 라우트를 거치게 해서 User-Agent를 붙이고 사용 정책을 지킨다.
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'dai-run-dev/1.0';

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=1&accept-language=ko&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

// 위경도를 "구 동" 형태의 짧은 라벨로 변환한다 (예: "강동구 상일동"). 못 찾으면 null.
export async function reverseGeocodeToDongLabel(lat: number, lng: number): Promise<string | null> {
  const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const address = data?.address;
  if (!address) return null;
  const gu = address.borough ?? address.city_district ?? '';
  const dong = address.quarter ?? address.suburb ?? address.neighbourhood ?? '';
  const label = `${gu} ${dong}`.trim();
  return label || null;
}
