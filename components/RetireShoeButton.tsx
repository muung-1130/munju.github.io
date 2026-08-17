'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 분석 결과가 아직 없어도(신발을 막 등록만 해두고 사진을 아직 안 올렸어도) 여기서 바로 버릴 수
// 있어야 해서, WearAnalysisHistoryPanel 로딩 상태와 무관하게 항상 노출한다.
export function RetireShoeButton({ userShoeId }: { userShoeId: string }) {
  const router = useRouter();
  const [retiring, setRetiring] = useState(false);

  async function retire() {
    if (!confirm('이 러닝화를 버릴까요? 목록에서는 사용 종료로 표시되고, 지금까지의 분석 기록은 그대로 보존돼요.')) return;
    setRetiring(true);
    try {
      const res = await fetch(`/api/user-shoes/${userShoeId}/retire`, { method: 'POST' });
      if (res.ok) {
        router.push('/shoes?tab=life');
        router.refresh();
      }
    } finally {
      setRetiring(false);
    }
  }

  return (
    <button className="ghost-btn small" disabled={retiring} onClick={retire}>
      {retiring ? '처리 중...' : '버리기'}
    </button>
  );
}
