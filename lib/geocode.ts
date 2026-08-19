// ⚠️ 죽은 코드 (2026-08-19): 무료 공개 Nominatim(OSM) 지오코딩 API(nominatim.openstreetmap.org)를
// 쓰는 헬퍼였다. 폐쇄망 전환으로 외부 API 호출이 막히면서 이 함수들을 부르던
// app/api/geo/dong-center/route.ts, app/api/geo/reverse-dong/route.ts(둘 다 원래도 nginx가
// course-service로 우회시켜 도달 불가능했던 경로, CLAUDE.md §3.1)와
// services-msa/course-service/src/routes/geo.ts의 같은 라우트를 같은 날짜에 비활성화했다.
// 이제 이 파일을 호출하는 곳이 없다. 재활성화하려면 법정동 경계/중심좌표 데이터를 로컬
// PostGIS 테이블로 적재하는 방식으로 다시 구현해야 한다(외부 API로 되돌리지 않는다).
//
// const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
// const USER_AGENT = 'dai-run-dev/1.0';
//
// export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
//   const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=1&accept-language=ko&q=${encodeURIComponent(address)}`;
//   const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
//   if (!res.ok) return null;
//   const data = await res.json();
//   if (!Array.isArray(data) || data.length === 0) return null;
//   return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
// }
//
// // 위경도를 "구 동" 형태의 짧은 라벨로 변환한다 (예: "강동구 상일동"). 못 찾으면 null.
// export async function reverseGeocodeToDongLabel(lat: number, lng: number): Promise<string | null> {
//   const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko`;
//   const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
//   if (!res.ok) return null;
//   const data = await res.json();
//   const address = data?.address;
//   if (!address) return null;
//   const gu = address.borough ?? address.city_district ?? '';
//   const dong = address.quarter ?? address.suburb ?? address.neighbourhood ?? '';
//   const label = `${gu} ${dong}`.trim();
//   return label || null;
// }
