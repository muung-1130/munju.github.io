import Link from 'next/link';
import { Card } from '@/components/UI';

type ShoeLifeSnapshot = {
  estimatedRemainingDistanceM: number | null;
  estimatedRemainingDays: number | null;
  replacementRecommendedAt: string | null;
  replacementProbability: number | null;
  daysUntilReplacement: number | null;
};

type UserShoeDetail = {
  userShoeId: string;
  shoeName: string;
  brandName: string;
  imageUrl: string;
  category: string | null;
  weightG: number | null;
  dropMm: number | null;
  nickname: string | null;
  purchaseDate: string | null;
  firstUsedAt: string | null;
  initialDistanceM: number;
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
  return (
    <Card className="mypage-shoes-card">
      <div className="card-head">
        <h2>보유 러닝화</h2>
      </div>
      {shoes.length === 0 ? (
        <p className="muted">등록된 러닝화가 없어요.</p>
      ) : (
        <div className="mypage-shoes-list">
          {shoes.map((shoe) => (
            <div key={shoe.userShoeId} className="mypage-shoe-row">
              <img src={shoe.imageUrl} alt="" />
              <div className="mypage-shoe-info">
                <strong>{shoe.nickname || shoe.shoeName}</strong>
                <span className="muted">
                  {shoe.brandName} · {shoe.shoeName}
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
              <Link href={`/shoes/${shoe.userShoeId}`} className="ghost-btn">
                자세히 보기
              </Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
