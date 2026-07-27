// 서울 25개 자치구 중심 nx,ny(기상청 단기예보 격자) + 대표 위경도.
// 계산 방법: 서울시 자치구 경계 GeoJSON(southkorea/seoul-maps)의 폴리곤 중심좌표를
// 기상청 공식 Lambert Conformal Conic 격자 변환 공식으로 변환. 중구가 nx=60,ny=127로 나와
// 외부에 공개된 기준값과 일치함을 확인했다.
// 에어코리아 측정소 이름도 이 자치구 이름과 대부분 동일해서(예: "강남구") 같은 표를 재사용한다.
export type SeoulDistrict = { name: string; nx: number; ny: number; lat: number; lng: number };

export const SEOUL_DISTRICTS: SeoulDistrict[] = [
  { name: '강남구', nx: 61, ny: 125, lat: 37.49665, lng: 127.063 },
  { name: '강동구', nx: 63, ny: 126, lat: 37.55045, lng: 127.14701 },
  { name: '강북구', nx: 60, ny: 128, lat: 37.64349, lng: 127.01119 },
  { name: '강서구', nx: 57, ny: 127, lat: 37.56125, lng: 126.82283 },
  { name: '관악구', nx: 59, ny: 125, lat: 37.46738, lng: 126.94539 },
  { name: '광진구', nx: 62, ny: 126, lat: 37.54672, lng: 127.08578 },
  { name: '구로구', nx: 58, ny: 125, lat: 37.49442, lng: 126.85633 },
  { name: '금천구', nx: 59, ny: 124, lat: 37.4606, lng: 126.90083 },
  { name: '노원구', nx: 61, ny: 129, lat: 37.65256, lng: 127.07504 },
  { name: '도봉구', nx: 61, ny: 129, lat: 37.66908, lng: 127.03239 },
  { name: '동대문구', nx: 61, ny: 127, lat: 37.58196, lng: 127.05487 },
  { name: '동작구', nx: 59, ny: 125, lat: 37.49889, lng: 126.95163 },
  { name: '마포구', nx: 59, ny: 127, lat: 37.55942, lng: 126.90811 },
  { name: '서대문구', nx: 59, ny: 127, lat: 37.5777, lng: 126.93905 },
  { name: '서초구', nx: 61, ny: 125, lat: 37.47332, lng: 127.03123 },
  { name: '성동구', nx: 61, ny: 126, lat: 37.55103, lng: 127.04107 },
  { name: '성북구', nx: 60, ny: 128, lat: 37.6057, lng: 127.01755 },
  { name: '송파구', nx: 62, ny: 125, lat: 37.50563, lng: 127.11535 },
  { name: '양천구', nx: 58, ny: 126, lat: 37.5248, lng: 126.85551 },
  { name: '영등포구', nx: 59, ny: 126, lat: 37.5224, lng: 126.91027 },
  { name: '용산구', nx: 60, ny: 126, lat: 37.53139, lng: 126.97991 },
  { name: '은평구', nx: 59, ny: 128, lat: 37.61919, lng: 126.92706 },
  { name: '종로구', nx: 60, ny: 127, lat: 37.59494, lng: 126.97733 },
  { name: '중구', nx: 60, ny: 127, lat: 37.56015, lng: 126.99594 },
  { name: '중랑구', nx: 62, ny: 127, lat: 37.59782, lng: 127.09288 }
];

const DEFAULT_DISTRICT = '중구';

// user.dong은 "서울특별시 강남구 역삼동"처럼 시도+구+동이 공백으로 합쳐진 문자열로 저장되어 있다
// (components/AuthForms.tsx가 주소 검색 결과의 display 필드를 그대로 저장). "구"로 끝나는 토큰을 뽑는다.
export function parseDistrictFromDong(dong: string | null | undefined): string | null {
  if (!dong) return null;
  const token = dong.split(/\s+/).find((part) => part.endsWith('구'));
  if (!token) return null;
  return SEOUL_DISTRICTS.some((d) => d.name === token) ? token : null;
}

export function resolveDefaultDistrict(dong: string | null | undefined): string {
  return parseDistrictFromDong(dong) ?? DEFAULT_DISTRICT;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestDistrict(lat: number, lng: number): SeoulDistrict {
  let best = SEOUL_DISTRICTS[0];
  let bestDist = Infinity;
  for (const district of SEOUL_DISTRICTS) {
    const dist = haversineKm(lat, lng, district.lat, district.lng);
    if (dist < bestDist) {
      bestDist = dist;
      best = district;
    }
  }
  return best;
}

export function getDistrict(name: string): SeoulDistrict | undefined {
  return SEOUL_DISTRICTS.find((d) => d.name === name);
}
