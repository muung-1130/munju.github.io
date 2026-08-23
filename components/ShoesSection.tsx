'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/UI';
import { ShoeFormModal } from '@/components/ShoeFormModal';

type ShoeLifeSnapshot = {
  estimatedRemainingDistanceM: number | null;
  estimatedRemainingDays: number | null;
  replacementRecommendedAt: string | null;
  replacementProbability: number | null;
  daysUntilReplacement: number | null;
};

type UserShoeDetail = {
  userShoeId: string;
  shoeName: string | null;
  brandName: string | null;
  imageUrl: string | null;
  hasCustomThumbnail: boolean;
  category: string | null;
  weightG: number | null;
  dropMm: number | null;
  nickname: string | null;
  purchaseDate: string | null;
  firstUsedAt: string | null;
  accumulatedDistanceM: number;
  status: string;
  registeredAt: string;
  retiredAt: string | null;
  latestSnapshot: ShoeLifeSnapshot | null;
};

function dDayLabel(days: number): string {
  if (days < 0) return `D+${Math.abs(days)} (교체 시기 지남)`;
  if (days === 0) return 'D-day';
  return `D-${days}`;
}

export function ShoesSection({ shoes }: { shoes: UserShoeDetail[] }) {
  const router = useRouter();
  const [formModal, setFormModal] = useState<{ mode: 'create' | 'edit'; userShoeId?: string } | null>(null);
  const [retiringId, setRetiringId] = useState<string | null>(null);

  async function retireShoe(userShoeId: string) {
    if (!confirm('이 러닝화를 버릴까요? 신발 정보와 마모 분석 사진·기록이 모두 영구 삭제되며 되돌릴 수 없어요.')) return;
    setRetiringId(userShoeId);
    try {
      const res = await fetch(`/api/user-shoes/${userShoeId}/retire`, { method: 'POST' });
      if (res.ok) router.refresh();
    } finally {
      setRetiringId(null);
    }
  }

  return (
    <Card className="mypage-shoes-card">
      <div className="card-head">
        <h2>보유 러닝화</h2>
        <button className="primary-btn small" onClick={() => setFormModal({ mode: 'create' })}>
          + 러닝화 추가
        </button>
      </div>
      {shoes.length === 0 ? (
        <p className="muted">등록된 러닝화가 없어요.</p>
      ) : (
        <div className="mypage-shoes-list">
          {shoes.map((shoe) => {
            const thumbnailSrc = shoe.imageUrl ?? (shoe.hasCustomThumbnail ? `/api/user-shoes/${shoe.userShoeId}/thumbnail` : null);
            return (
              <div key={shoe.userShoeId} className="mypage-shoe-row">
                {thumbnailSrc ? <img src={thumbnailSrc} alt="" /> : <div className="mypage-shoe-img-placeholder">👟</div>}
                <div className="mypage-shoe-info">
                  <Link href={`/shoes/${shoe.userShoeId}`} className="mypage-shoe-name-link">
                    <strong>{shoe.nickname || shoe.shoeName}</strong>
                  </Link>
                  <span className="muted">
                    {shoe.brandName ? `${shoe.brandName} · ${shoe.shoeName}` : '직접 등록한 러닝화'}
                  </span>
                  <span className="muted">
                    누적 거리 {(shoe.accumulatedDistanceM / 1000).toFixed(1)}km
                    {shoe.weightG && ` · ${shoe.weightG}g`}
                    {shoe.dropMm !== null && ` · 드롭 ${shoe.dropMm}mm`}
                  </span>
                  <span className="muted">
                    {shoe.purchaseDate ? `구매일 ${shoe.purchaseDate}` : '구매일 미등록'} · 상태 {shoe.status === 'ACTIVE' ? '사용중' : '은퇴'}
                  </span>
                </div>
                <div className="mypage-shoe-life">
                  {shoe.latestSnapshot ? (
                    <>
                      <span className="muted">교체 권장일</span>
                      <strong>{shoe.latestSnapshot.replacementRecommendedAt ?? '-'}</strong>
                      {shoe.latestSnapshot.daysUntilReplacement !== null && (
                        <span className={`shoe-dday ${shoe.latestSnapshot.daysUntilReplacement <= 7 ? 'urgent' : ''}`}>
                          {dDayLabel(shoe.latestSnapshot.daysUntilReplacement)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="muted">수명 예측 정보가 아직 없어요.</span>
                  )}
                </div>
                <div className="mypage-shoe-actions">
                  <button className="ghost-btn small" onClick={() => setFormModal({ mode: 'edit', userShoeId: shoe.userShoeId })}>
                    수정
                  </button>
                  <Link href={`/shoes/${shoe.userShoeId}`} className="ghost-btn small">
                    분석결과 보기
                  </Link>
                  {shoe.status !== 'RETIRED' && (
                    <button className="ghost-btn small" disabled={retiringId === shoe.userShoeId} onClick={() => retireShoe(shoe.userShoeId)}>
                      {retiringId === shoe.userShoeId ? '처리 중...' : '버리기'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formModal && (
        <ShoeFormModal
          mode={formModal.mode}
          userShoeId={formModal.userShoeId}
          onClose={() => setFormModal(null)}
          onDone={() => {
            setFormModal(null);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}
