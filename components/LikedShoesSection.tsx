'use client';

import { useState } from 'react';
import { Card } from '@/components/UI';

type LikedShoe = {
  shoeId: number;
  shoeName: string;
  brandName: string;
  imageUrl: string;
  detailUrl: string;
  price: number | null;
  currency: string | null;
  likedAt: string;
};

function formatPrice(price: number | null): string {
  if (price === null) return '가격 정보 없음';
  return `${Math.round(price).toLocaleString('ko-KR')}원`;
}

export function LikedShoesSection({ shoes }: { shoes: LikedShoe[] }) {
  const [list, setList] = useState(shoes);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function unlike(shoeId: number) {
    setBusyId(shoeId);
    try {
      const res = await fetch(`/api/shoes/${shoeId}/like`, { method: 'POST' });
      if (res.ok) {
        setList((prev) => prev.filter((s) => s.shoeId !== shoeId));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mypage-liked-shoes-card">
      <div className="card-head">
        <h2>찜한 러닝화</h2>
      </div>
      {list.length === 0 ? (
        <p className="muted">찜한 러닝화가 없어요. 러닝화 추천 페이지에서 하트를 눌러보세요.</p>
      ) : (
        <div className="mypage-liked-shoes-list">
          {list.map((shoe) => (
            <div key={shoe.shoeId} className="mypage-liked-shoe-row">
              <img src={shoe.imageUrl} alt="" />
              <div className="mypage-shoe-info">
                <strong>{shoe.shoeName}</strong>
                <span className="muted">{shoe.brandName}</span>
                <span className="muted">{formatPrice(shoe.price)}</span>
              </div>
              <a href={shoe.detailUrl} target="_blank" rel="noreferrer" className="ghost-btn">
                상세 보기
              </a>
              <button className="heart liked" disabled={busyId === shoe.shoeId} onClick={() => unlike(shoe.shoeId)} aria-label="찜 해제">
                ♥
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
