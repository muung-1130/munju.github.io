import { Router } from 'express';
import { getPool } from '../lib/db.js';
// 2026-08-19: /geo/dong-center, /geo/reverse-dong를 아래에서 주석 처리하면서 geocodeAddress,
// reverseGeocodeToDongLabel을 호출하는 곳이 이 파일에 더는 없다. import도 함께 비활성화한다.
// import { geocodeAddress, reverseGeocodeToDongLabel } from '../lib/geocode.js';

const router = Router();

// 예전엔 juso.go.kr(도로명주소 API)를 호출했지만, 폐쇄망 전환으로 외부 호출이 불가능해져
// 행정안전부 법정동코드 전체자료를 course.legal_dong_codes에 미리 적재해두고(db/045,
// db/ingest-legal-dong-codes.mjs) 로컬 조회로 대체했다. 응답 모양({sido, sigungu, dong,
// display})은 그대로 유지해 AuthForms/CompleteProfileModal/EditProfileModal이 무수정으로
// 동작한다.
router.get('/dong/search', async (req, res) => {
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
  if (keyword.length < 2) {
    res.json({ results: [] });
    return;
  }

  const escapedKeyword = keyword.replace(/[\\%_]/g, (ch) => `\\${ch}`);

  try {
    const { rows } = await getPool().query(
      `SELECT sido, sigungu, dong, full_name AS display
       FROM course.legal_dong_codes
       WHERE is_active = true AND dong IS NOT NULL AND full_name ILIKE '%' || $1 || '%' ESCAPE '\\'
       ORDER BY length(full_name), full_name
       LIMIT 20`,
      [escapedKeyword]
    );

    res.json({ results: rows });
  } catch (err) {
    console.error('[geo] dong search failed', err);
    res.status(502).json({ results: [], error: '주소 검색 중 오류가 발생했어요.' });
  }
});

// ⚠️ 죽은 코드 (2026-08-19부터, 아래 두 라우트 모두):
// /geo/dong-center — 로그인 회원의 auth_user.users.dong을 좌표로 바꿔 GPS 실패 시 지도 폴백
// 중심점으로 쓰던 엔드포인트. lib/geocode.ts의 geocodeAddress()가 juso.go.kr/nominatim 같은
// 외부 지오코딩 API를 호출하는 구조였는데, 폐쇄망 전환으로 이 호출이 막혔다. 회원 동 코드는
// course.legal_dong_codes 텍스트 매칭(동 검색, /dong/search)까지는 대체했지만 "좌표로 변환"은
// 별도의 동 경계/중심좌표 데이터가 있어야 해서 아직 로컬 대체재가 없다. 호출하던
// components/CourseNearbyExplorer.tsx도 GPS 실패 시 고정 좌표(DEFAULT_FALLBACK_LOCATION)를
// 쓰도록 바뀌어 더는 이 엔드포인트를 호출하지 않는다.
//
// /geo/reverse-dong — GPS 좌표를 "OO구 OO동" 라벨로 보여주기 위한 nominatim.openstreetmap.org
// 리버스 지오코딩 호출. 이것도 외부 API라 폐쇄망에서 항상 실패한다(호출부는 실패를 조용히
// 삼키게 돼 있어 지도 동작 자체가 깨지진 않았지만, 매번 실패하는 외부 요청이 나가고 있었다).
// 마찬가지로 CourseNearbyExplorer.tsx 쪽 호출부도 주석 처리했다.
//
// 재활성화하려면: 법정동 경계 폴리곤(SHP/GeoJSON, 국가공간정보포털·통계청 SGIS 등)을 받아
// PostGIS 테이블로 적재하고 ST_Contains/centroid 기반으로 다시 구현해야 한다.
//
// router.get('/geo/dong-center', async (req, res) => {
//   const address = req.query.address;
//   if (typeof address !== 'string') {
//     res.status(400).json({ error: 'address가 필요해요.' });
//     return;
//   }
//   const point = await geocodeAddress(address);
//   if (!point) {
//     res.status(404).json({ error: '주소를 찾지 못했어요.' });
//     return;
//   }
//   res.json(point);
// });
//
// router.get('/geo/reverse-dong', async (req, res) => {
//   const lat = Number(req.query.lat);
//   const lng = Number(req.query.lng);
//   if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
//     res.status(400).json({ error: 'lat, lng가 필요해요.' });
//     return;
//   }
//   const label = await reverseGeocodeToDongLabel(lat, lng);
//   res.json({ label });
// });

type KakaoDirectionsResponse = {
  routes: {
    result_code: number;
    sections: { roads: { vertexes: number[] }[] }[];
  }[];
};

// 러닝 시작 화면에서 "현재 위치 → 코스 시작점"까지 보행 경로를 그려주기 위한 프록시.
// 브라우저가 Kakao API 키를 직접 들고 호출하지 않도록(§18 API key 보호) 서버에서 호출하고
// 좌표 배열만 돌려준다. 키는 루트 .env의 KAKAO_API_KEY를 그대로 쓴다(services-msa 모든
// 컨테이너가 env_file로 루트 .env를 이미 로드한다 — /dong/search의 JUSO_API_KEY와 동일 패턴).
router.get('/geo/walking-directions', async (req, res) => {
  const fromLat = Number(req.query.fromLat);
  const fromLng = Number(req.query.fromLng);
  const toLat = Number(req.query.toLat);
  const toLng = Number(req.query.toLng);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    res.status(400).json({ error: 'fromLat, fromLng, toLat, toLng가 필요해요.' });
    return;
  }

  const apiKey = process.env.KAKAO_API_KEY;
  if (!apiKey) {
    res.status(501).json({ positions: [], error: 'Kakao 길찾기 API 키(KAKAO_API_KEY)가 설정되지 않았어요.' });
    return;
  }

  const url = new URL('https://apis-navi.kakaomobility.com/v1/directions');
  url.searchParams.set('origin', `${fromLng},${fromLat}`);
  url.searchParams.set('destination', `${toLng},${toLat}`);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      cache: 'no-store'
    } as RequestInit);
    if (!response.ok) {
      res.status(502).json({ positions: [], error: '길찾기 API 호출에 실패했어요.' });
      return;
    }
    const data = (await response.json()) as KakaoDirectionsResponse;
    const route = data.routes?.[0];
    if (!route || route.result_code !== 0) {
      res.status(404).json({ positions: [], error: '경로를 찾지 못했어요.' });
      return;
    }
    // vertexes는 [lng, lat, lng, lat, ...] 평탄 배열이다 — 화면 지도 라이브러리 규약대로
    // [lat, lng] 쌍으로 변환한다(§5.4).
    const positions: [number, number][] = [];
    for (const section of route.sections ?? []) {
      for (const road of section.roads ?? []) {
        const vertexes = road.vertexes ?? [];
        for (let i = 0; i + 1 < vertexes.length; i += 2) {
          positions.push([vertexes[i + 1], vertexes[i]]);
        }
      }
    }
    res.json({ positions });
  } catch {
    res.status(502).json({ positions: [], error: '길찾기 중 오류가 발생했어요.' });
  }
});

export default router;
