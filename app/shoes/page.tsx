'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Card, PageTitle } from '@/components/UI';
import { useAuthModal } from '@/components/AuthModalContext';
import { ShoeCatalogBrowser } from '@/components/ShoeCatalogBrowser';
import { ShoeFormModal } from '@/components/ShoeFormModal';

type ShoeItem = {
  shoeId: number;
  shoeName: string;
  brandName: string;
  imageUrl: string;
  detailUrl: string;
  category: string;
  catalogScore: number;
  purpose: string | null;
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

type RecommendedShoeItem = ShoeItem & { matchScore: number; reason: string };

type MyShoeItem = {
  userShoeId: string;
  shoeName: string;
  brandName: string;
  nickname: string | null;
  accumulatedDistanceM: number;
  status: string;
  latestSnapshot: { replacementRecommendedAt: string | null; daysUntilReplacement: number | null } | null;
};

const FUNCTION_LABEL: Record<string, string> = {
  cushioning: '쿠셔닝',
  energy_return: '반발력',
  stability: '안정성',
  lightweight: '경량성',
  grip: '접지력'
};

const FOOT_TYPE_OPTIONS = ['좁음', '보통', '넓음'];

const SLIDER_FIELDS: { key: 'cushion' | 'stability' | 'responsiveness' | 'grip' | 'distance'; label: string; left: string; right: string }[] = [
  { key: 'cushion', label: '쿠션감', left: '단단한', right: '푹신한' },
  { key: 'stability', label: '안정성', left: '낮은', right: '높은' },
  { key: 'responsiveness', label: '반발력', left: '낮은', right: '높은' },
  { key: 'grip', label: '접지력', left: '낮은', right: '높은' },
  { key: 'distance', label: '주행 거리', left: '단거리', right: '장거리' }
];

function formatPrice(price: number | null): string {
  if (price === null) return '가격 정보 없음';
  return `${Math.round(price).toLocaleString('ko-KR')}원`;
}

function ShoeTags({ shoe }: { shoe: ShoeItem }) {
  const tags = [shoe.purpose, shoe.cushioningValue, ...shoe.functionCodes.slice(0, 1).map((c) => FUNCTION_LABEL[c] ?? c)].filter(
    Boolean
  ) as string[];
  return (
    <div>
      {tags.slice(0, 3).map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}

export default function ShoesPage() {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();

  const [activeTab, setActiveTab] = useState<'reco' | 'life' | 'manage'>('reco');

  const [sliders, setSliders] = useState({ cushion: 3, stability: 3, responsiveness: 3, grip: 3, distance: 3 });
  const [footType, setFootType] = useState('보통');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<RecommendedShoeItem[] | null>(null);
  const [likeBusyId, setLikeBusyId] = useState<number | null>(null);
  const [myShoes, setMyShoes] = useState<MyShoeItem[] | null>(null);
  const [shoeFormModal, setShoeFormModal] = useState<{ mode: 'create' | 'edit'; userShoeId?: string } | null>(null);
  const [retiringId, setRetiringId] = useState<string | null>(null);

  const loadRecommendations = useCallback(async () => {
    const res = await fetch('/api/shoes/recommendations');
    if (res.ok) {
      const data = await res.json();
      setRecommendations(data.shoes);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const loadMyShoes = useCallback(() => {
    if (!session?.user) return;
    fetch('/api/shoes/mine')
      .then((res) => (res.ok ? res.json() : { shoes: [] }))
      .then((data) => setMyShoes(data.shoes ?? []));
  }, [session?.user]);

  useEffect(() => {
    if (activeTab !== 'life') return;
    loadMyShoes();
  }, [activeTab, loadMyShoes]);

  async function retireShoe(userShoeId: string) {
    if (!confirm('이 러닝화를 버릴까요? (은퇴 처리되며 기록은 남아요)')) return;
    setRetiringId(userShoeId);
    try {
      const res = await fetch(`/api/user-shoes/${userShoeId}/retire`, { method: 'POST' });
      if (res.ok) loadMyShoes();
    } finally {
      setRetiringId(null);
    }
  }

  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const res = await fetch('/api/shoes/preferences');
      if (!res.ok) return;
      const data = await res.json();
      const prefs = data.preferences;
      if (!prefs) return;
      setSliders({
        cushion: prefs.cushionPreference ?? 3,
        stability: prefs.stabilityPreference ?? 3,
        responsiveness: prefs.responsivenessPreference ?? 3,
        grip: prefs.gripPreference ?? 3,
        distance: prefs.distancePreference ?? 3
      });
      if (prefs.footType) setFootType(prefs.footType);
      setBudgetMin(prefs.budgetMin !== null && prefs.budgetMin !== undefined ? String(prefs.budgetMin) : '');
      setBudgetMax(prefs.budgetMax !== null && prefs.budgetMax !== undefined ? String(prefs.budgetMax) : '');
    })();
  }, [session?.user]);

  async function submitPreferences() {
    if (!session?.user) {
      openAuthModal();
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/shoes/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cushionPreference: sliders.cushion,
          stabilityPreference: sliders.stability,
          responsivenessPreference: sliders.responsiveness,
          gripPreference: sliders.grip,
          distancePreference: sliders.distance,
          footType,
          budgetMin: budgetMin === '' ? null : Number(budgetMin),
          budgetMax: budgetMax === '' ? null : Number(budgetMax)
        })
      });
      if (res.ok) {
        setSaveMessage('선호도를 저장했어요. AI 추천을 새로 계산했어요!');
        await loadRecommendations();
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveMessage(data.error ?? '저장에 실패했어요.');
      }
    } finally {
      setSaving(false);
    }
  }

  function resetSliders() {
    setSliders({ cushion: 3, stability: 3, responsiveness: 3, grip: 3, distance: 3 });
    setFootType('보통');
    setBudgetMin('');
    setBudgetMax('');
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
        setRecommendations((prev) =>
          prev ? prev.map((s) => (s.shoeId === shoeId ? { ...s, likeCount: state.likeCount, likedByUser: state.likedByUser } : s)) : prev
        );
      }
    } finally {
      setLikeBusyId(null);
    }
  }

  return (
    <div>
      <PageTitle
        title="러닝화 추천 & 수명 예측"
        subtitle="AI가 당신의 러닝 스타일에 맞는 러닝화를 추천하고, 수명을 예측해 드려요."
        action={
          <Link href="/shoes/guide" className="ghost-btn">
            러닝화 가이드
          </Link>
        }
      />
      <div className="tab-line">
        <button className={activeTab === 'reco' ? 'active' : ''} onClick={() => setActiveTab('reco')}>
          러닝화 추천
        </button>
        <button className={activeTab === 'life' ? 'active' : ''} onClick={() => setActiveTab('life')}>
          러닝화 수명 예측
        </button>
        <button className={activeTab === 'manage' ? 'active' : ''} onClick={() => setActiveTab('manage')}>
          나의 러닝화 관리
        </button>
      </div>

      {activeTab === 'reco' && (
        <div className="shoes-layout">
          <Card className="quiz-card">
            <div className="card-head">
              <h2>나에게 맞는 러닝화 찾기</h2>
              <button className="text-link" onClick={resetSliders}>
                초기화
              </button>
            </div>
            <p>선호도를 선택하면 AI가 추천해드려요!</p>
            {SLIDER_FIELDS.map((field) => (
              <div className="slider-row" key={field.key}>
                <strong>{field.label}</strong>
                <div>
                  <span>{field.left}</span>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={sliders[field.key]}
                    onChange={(event) => setSliders((prev) => ({ ...prev, [field.key]: Number(event.target.value) }))}
                  />
                  <span>{field.right}</span>
                </div>
              </div>
            ))}
            <h3>발볼 선호</h3>
            <div className="env-grid foot-type-grid">
              {FOOT_TYPE_OPTIONS.map((type) => (
                <button key={type} className={footType === type ? 'selected' : ''} onClick={() => setFootType(type)}>
                  {type}
                </button>
              ))}
            </div>
            <h3>예산</h3>
            <div className="budget-row">
              <input
                type="number"
                min="0"
                placeholder="최소 (원)"
                value={budgetMin}
                onChange={(event) => setBudgetMin(event.target.value)}
              />
              <span>~</span>
              <input
                type="number"
                min="0"
                placeholder="최대 (원)"
                value={budgetMax}
                onChange={(event) => setBudgetMax(event.target.value)}
              />
            </div>
            <button className="primary-outline" disabled={saving} onClick={submitPreferences}>
              {saving ? '저장하는 중...' : '✨ AI 추천 결과 보기'}
            </button>
            {saveMessage && <p className="field-ok">{saveMessage}</p>}
          </Card>

          <Card className="recommend-card">
            <div className="card-head">
              <h2>AI 추천 러닝화</h2>
            </div>

            <div className="shoe-products">
              {recommendations === null ? (
                <p className="muted">추천을 계산하는 중...</p>
              ) : recommendations.length === 0 ? (
                <p className="muted">해당 예산의 러닝화가 없습니다.</p>
              ) : (
                recommendations.map((shoe, idx) => (
                  <div className="shoe-card" key={shoe.shoeId}>
                    <span className={`reco-badge b${idx}`}>추천 {idx + 1} · {shoe.matchScore}점</span>
                    <img src={shoe.imageUrl} alt="" />
                    <h3>{shoe.shoeName}</h3>
                    <b>{formatPrice(shoe.price)}</b>
                    <ShoeTags shoe={shoe} />
                    <p className="shoe-reco-reason">{shoe.reason}</p>
                    <a href={shoe.detailUrl} target="_blank" rel="noreferrer">
                      <button>상세 보기</button>
                    </a>
                    <button
                      className={`heart ${shoe.likedByUser ? 'liked' : ''}`}
                      disabled={likeBusyId === shoe.shoeId}
                      onClick={() => toggleLike(shoe.shoeId)}
                    >
                      {shoe.likedByUser ? '♥' : '♡'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'reco' && <ShoeCatalogBrowser />}

      {activeTab === 'life' && (
        <div className="shoes-life-centered">
          <Card className="life-card">
            <div className="card-head">
              <h2>러닝화 수명 예측</h2>
              {session?.user && (
                <button className="primary-btn small" onClick={() => setShoeFormModal({ mode: 'create' })}>
                  + 러닝화 추가
                </button>
              )}
            </div>
            <p>AI가 사진 5장(밑창·뒤꿈치·측면)을 보고 마모 단계와 잔여 수명을 예측해 드려요.</p>
            {!session?.user ? (
              <p className="muted">로그인하면 보유 중인 러닝화를 확인할 수 있어요.</p>
            ) : myShoes === null ? (
              <p className="muted">불러오는 중...</p>
            ) : myShoes.length === 0 ? (
              <p className="muted">등록된 러닝화가 없어요. "+ 러닝화 추가"로 첫 러닝화를 등록해 보세요.</p>
            ) : (
              <div className="mypage-shoes-list">
                {myShoes.map((shoe) => (
                  <div key={shoe.userShoeId} className="mypage-shoe-row">
                    <div className="mypage-shoe-info">
                      <strong>{shoe.nickname || shoe.shoeName}</strong>
                      <span className="muted">
                        {shoe.brandName} · {shoe.shoeName}
                        {shoe.status === 'RETIRED' && ' · 은퇴함'}
                      </span>
                      <span className="muted">누적 거리 {(shoe.accumulatedDistanceM / 1000).toFixed(1)}km</span>
                    </div>
                    <div className="mypage-shoe-life">
                      {shoe.latestSnapshot?.replacementRecommendedAt ? (
                        <>
                          <span className="muted">교체 권장일</span>
                          <strong>{shoe.latestSnapshot.replacementRecommendedAt}</strong>
                        </>
                      ) : (
                        <span className="muted">수명 예측 정보가 아직 없어요.</span>
                      )}
                    </div>
                    <div className="mypage-shoe-actions">
                      <button className="ghost-btn small" onClick={() => setShoeFormModal({ mode: 'edit', userShoeId: shoe.userShoeId })}>
                        수정
                      </button>
                      <Link href={`/shoes/${shoe.userShoeId}`} className="ghost-btn small">
                        분석
                      </Link>
                      {shoe.status !== 'RETIRED' && (
                        <button className="ghost-btn small" disabled={retiringId === shoe.userShoeId} onClick={() => retireShoe(shoe.userShoeId)}>
                          {retiringId === shoe.userShoeId ? '처리 중...' : '버리기'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {shoeFormModal && (
        <ShoeFormModal
          mode={shoeFormModal.mode}
          userShoeId={shoeFormModal.userShoeId}
          onClose={() => setShoeFormModal(null)}
          onDone={() => {
            setShoeFormModal(null);
            loadMyShoes();
          }}
        />
      )}

      {activeTab === 'manage' && (
        <Card className="shoes-manage-empty">
          <h2>나의 러닝화 관리</h2>
          <p className="muted">보유 중인 러닝화와 마모 분석 기록은 마이페이지에서 확인하고 관리할 수 있어요.</p>
          <Link href="/mypage">
            <button className="primary-btn">마이페이지로 이동</button>
          </Link>
        </Card>
      )}

      <Card className="ai-tip-strip">
        ✨ <b>AI 러닝화 추천 팁</b> 사용자의 러닝 기록, 선호도, 체형 데이터를 종합 분석하여 최적의 러닝화를 추천해드립니다.
      </Card>
    </div>
  );
}
