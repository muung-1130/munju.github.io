import { Router } from 'express';
import { geocodeAddress, reverseGeocodeToDongLabel } from '../lib/geocode.js';

const router = Router();

type JusoItem = { siNm: string; sggNm: string; emdNm: string };

router.get('/dong/search', async (req, res) => {
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
  if (keyword.length < 2) {
    res.json({ results: [] });
    return;
  }

  const confmKey = process.env.JUSO_API_KEY;
  if (!confmKey) {
    res.status(501).json({ results: [], error: '주소 검색 API 키(JUSO_API_KEY)가 설정되지 않았어요. juso.go.kr에서 발급받은 승인키를 .env에 넣어주세요.' });
    return;
  }

  const url = new URL('https://www.juso.go.kr/addrlink/addrLinkApi.do');
  url.searchParams.set('confmKey', confmKey);
  url.searchParams.set('currentPage', '1');
  url.searchParams.set('countPerPage', '20');
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('resultType', 'json');

  try {
    const response = await fetch(url, { cache: 'no-store' } as RequestInit);
    const data: any = await response.json();
    const items: JusoItem[] = data?.results?.juso ?? [];

    const seen = new Set<string>();
    const results = items
      .filter((item) => item.emdNm)
      .map((item) => ({ sido: item.siNm, sigungu: item.sggNm, dong: item.emdNm, display: `${item.siNm} ${item.sggNm} ${item.emdNm}` }))
      .filter((item) => {
        if (seen.has(item.display)) return false;
        seen.add(item.display);
        return true;
      });

    res.json({ results });
  } catch {
    res.status(502).json({ results: [], error: '주소 검색 중 오류가 발생했어요.' });
  }
});

router.get('/geo/dong-center', async (req, res) => {
  const address = req.query.address;
  if (typeof address !== 'string') {
    res.status(400).json({ error: 'address가 필요해요.' });
    return;
  }
  const point = await geocodeAddress(address);
  if (!point) {
    res.status(404).json({ error: '주소를 찾지 못했어요.' });
    return;
  }
  res.json(point);
});

router.get('/geo/reverse-dong', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat, lng가 필요해요.' });
    return;
  }
  const label = await reverseGeocodeToDongLabel(lat, lng);
  res.json({ label });
});

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
