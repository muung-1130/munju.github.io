'use client';

import { useRouter } from 'next/navigation';
import { AuthForms } from '@/components/AuthForms';

export function AuthModal({
  open,
  onClose,
  demoLoginEnabled
}: {
  open: boolean;
  onClose: () => void;
  demoLoginEnabled?: boolean;
}) {
  const router = useRouter();

  if (!open) return null;

  function handleAuthenticated() {
    onClose();
    // 리뷰 작성처럼 현재 페이지에서 이어서 할 일이 있을 수 있으므로 홈으로 보내지 않고
    // 지금 있던 페이지에서 세션 정보만 새로고침한다.
    router.refresh();
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose} aria-label="닫기">✕</button>
        <AuthForms onAuthenticated={handleAuthenticated} demoLoginEnabled={demoLoginEnabled} />
      </div>
    </div>
  );
}
