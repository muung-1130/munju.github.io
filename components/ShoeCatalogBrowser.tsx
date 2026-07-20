'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card } from '@/components/UI';
import { useAuthModal } from '@/components/AuthModalContext';

type ShoeItem = {
  shoeId: number;
  shoeName: string;
  brandName: string;
  imageUrl: string;
  detailUrl: string;
  category: string;
  catalogScore: number;
  recommendLevel: string | null;
  purpose: string | null;
  footWidth: string | null;
  toeBox: string | null;
  cushioningValue: string | null;
  archSupport: string | null;
  weightG: number | null;
  dropMm: number | null;
  carbonPlate: boolean | null;
  price: number | null;
  currency: string | null;
  functionCodes: string[];
  likeCount: number;
  likedByUser: boolean;
};

type FilterOptions = { brands: string[]; purposes: string[]; recommendLevels: string[] };

const FUNCTION_LABEL: Record<string, string> = {
  cushioning: '쿠셔닝',
  energy_return: '반발력',
  stability: '안정성',
  lightweight: '경량성',
  grip: '접지력'
};

function formatPrice(price: number | null): string {
  if (price === null) return '가격 정보 없음';
  return `${Math.round(price).toLocaleString('ko-KR')}원`;
}

function ShoeDetailCard({
  shoe,
  onToggleLike,
  likeBusy
}: {
  shoe: ShoeItem;
  onToggleLike: (shoeId: number) => void;
  likeBusy: boolean;
}) {
  return (
    <div className="shoe-card shoe-card-detailed">
      <img src={shoe.imageUrl} alt="" />
      <span className="shoe-brand">{shoe.brandName}</span>
      <h3>{shoe.shoeName}</h3>
      <b>{formatPrice(shoe.price)}</b>
      <div className="shoe-spec-grid">
        {shoe.recommendLevel && <span>레벨 {shoe.recommendLevel}</span>}
        {shoe.purpose && <span>{shoe.purpose}</span>}
        {shoe.cushioningValue && <span>쿠션 {shoe.cushioningValue}</span>}
        {shoe.archSupport && <span>{shoe.archSupport}</span>}
        {shoe.footWidth && <span>발볼 {shoe.footWidth}</span>}
        {shoe.toeBox && <span>앞볼 {shoe.toeBox}</span>}
        {shoe.weightG !== null && <span>{shoe.weightG}g</span>}
        {shoe.dropMm !== null && <span>드롭 {shoe.dropMm}mm</span>}
        {shoe.carbonPlate && <span>카본 플레이트</span>}
      </div>
      {shoe.functionCodes.length > 0 && (
        <div className="shoe-function-tags">
          {shoe.functionCodes.map((code) => (
            <span key={code}>{FUNCTION_LABEL[code] ?? code}</span>
          ))}
        </div>
      )}
      <div className="shoe-card-footer">
        <span className="shoe-catalog-score">종합 {shoe.catalogScore}점 · ♥ {shoe.likeCount}</span>
        <a href={shoe.detailUrl} target="_blank" rel="noreferrer">
          <button>상세 보기</button>
        </a>
        <button className={`heart ${shoe.likedByUser ? 'liked' : ''}`} disabled={likeBusy} onClick={() => onToggleLike(shoe.shoeId)}>
          {shoe.likedByUser ? '♥' : '♡'}
        </button>
      </div>
    </div>
  );
}

export function ShoeCatalogBrowser() {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();

  const [expanded, setExpanded] = useState(false);
  const [shoes, setShoes] = useState<ShoeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [likeBusyId, setLikeBusyId] = useState<number | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [purpose, setPurpose] = useState('');
  const [recommendLevel, setRecommendLevel] = useState('');
  const [carbonOnly, setCarbonOnly] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  async function load(offset: number, append: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (brand) params.set('brand', brand);
      if (purpose) params.set('purpose', purpose);
      if (recommendLevel) params.set('recommendLevel', recommendLevel);
      if (carbonOnly) params.set('carbonPlate', 'true');
      params.set('offset', String(offset));
      const res = await fetch(`/api/shoes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setShoes((prev) => (append ? [...prev, ...data.shoes] : data.shoes));
        setTotal(data.total);
        setHasMore(data.hasMore);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleExpand() {
    setExpanded(true);
    if (!filterOptions) {
      fetch('/api/shoes/filters')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setFilterOptions(data));
    }
  }

  useEffect(() => {
    if (!expanded) return;
    load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, query, brand, purpose, recommendLevel, carbonOnly]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setQuery(searchInput.trim());
  }

  async function toggleLike(shoeId: number) {
    if (!session?.user) {
      openAuthModal();
      return;
    }
    setLikeBusyId(shoeId);
    try {
      const res = await fetch(`/api/shoes/${shoeId}/like`, { method: 'POST' });
      if (res.ok) {
        const state = await res.json();
        setShoes((prev) => prev.map((s) => (s.shoeId === shoeId ? { ...s, likeCount: state.likeCount, likedByUser: state.likedByUser } : s)));
      }
    } finally {
      setLikeBusyId(null);
    }
  }

  if (!expanded) {
    return (
      <button type="button" className="ghost-btn full-width shoe-catalog-expand-btn" onClick={handleExpand}>
        더보기 — 전체 러닝화 둘러보기
      </button>
    );
  }

  return (
    <Card className="shoe-catalog-browser">
      <div className="card-head">
        <h2>전체 러닝화 {total > 0 && <span className="muted">{total}개</span>}</h2>
      </div>

      <form className="shoe-catalog-search" onSubmit={submitSearch}>
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="러닝화 이름이나 브랜드로 검색"
        />
        <button type="submit">검색</button>
      </form>

      <div className="shoe-catalog-filters">
        <select value={brand} onChange={(event) => setBrand(event.target.value)}>
          <option value="">브랜드 전체</option>
          {filterOptions?.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
          <option value="">용도 전체</option>
          {filterOptions?.purposes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={recommendLevel} onChange={(event) => setRecommendLevel(event.target.value)}>
          <option value="">레벨 전체</option>
          {filterOptions?.recommendLevels.map((lv) => (
            <option key={lv} value={lv}>
              {lv}
            </option>
          ))}
        </select>
        <label className="shoe-catalog-carbon-filter">
          <input type="checkbox" checked={carbonOnly} onChange={(event) => setCarbonOnly(event.target.checked)} />
          카본 플레이트만
        </label>
      </div>

      <div className="shoe-products detailed-grid">
        {shoes.map((shoe) => (
          <ShoeDetailCard key={shoe.shoeId} shoe={shoe} onToggleLike={toggleLike} likeBusy={likeBusyId === shoe.shoeId} />
        ))}
      </div>

      {shoes.length === 0 && !loading && <p className="muted">조건에 맞는 러닝화가 없어요.</p>}
      {loading && shoes.length === 0 && <p className="muted">불러오는 중...</p>}

      {hasMore && (
        <button type="button" className="ghost-btn full-width" disabled={loading} onClick={() => load(shoes.length, true)}>
          {loading ? '불러오는 중...' : '더 불러오기'}
        </button>
      )}
    </Card>
  );
}
