'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';

export function WithdrawAccountButton() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleWithdraw() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/withdraw', { method: 'POST' });
      if (res.ok) {
        // signOut({ callbackUrl })은 서버(NEXTAUTH_URL) 기준으로 리다이렉트 주소를 계산해서
        // 붙여준다 — 지금 접속한 주소(예: 192.168.0.212:8080)와 NEXTAUTH_URL(localhost:8080,
        // 구글 로그인 때문에 이렇게 맞춰둠)이 다르면 로그아웃 후 엉뚱한 주소로 튕겨나가면서
        // 쿠키도 없는 새 origin이라 Unauthorized가 뜬다. redirect:false로 자동 이동을 막고
        // 지금 보고 있는 주소 기준으로 직접 이동시킨다.
        await signOut({ redirect: false });
        window.location.href = '/';
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="withdraw-row">
        <button className="withdraw-link" onClick={() => setConfirmOpen(true)}>
          회원 탈퇴
        </button>
      </div>

      {confirmOpen && (
        <div className="crew-chat-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="crew-detail-modal" style={{ width: 360 }} onClick={(event) => event.stopPropagation()}>
            <div className="crew-chat-modal-head">
              <strong>회원 탈퇴</strong>
              <button onClick={() => setConfirmOpen(false)} aria-label="닫기">✕</button>
            </div>
            <p>정말로 탈퇴하시겠습니까?</p>
            <div className="crew-battle-actions">
              <button className="ghost-btn" disabled={loading} onClick={() => setConfirmOpen(false)}>
                취소
              </button>
              <button className="primary-btn" disabled={loading} onClick={handleWithdraw}>
                {loading ? '처리 중...' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
