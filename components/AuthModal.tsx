'use client';

import { useRouter } from 'next/navigation';
import { AuthForms } from '@/components/AuthForms';

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();

  if (!open) return null;

  function handleAuthenticated() {
    onClose();
    router.push('/');
    router.refresh();
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose} aria-label="닫기">✕</button>
        <AuthForms onAuthenticated={handleAuthenticated} />
      </div>
    </div>
  );
}
