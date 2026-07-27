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

export default router;
