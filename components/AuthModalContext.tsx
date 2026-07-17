'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { AuthModal } from './AuthModal';

type AuthModalContextValue = {
  openAuthModal: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

// 로그인 모달을 트리 어디서든(코스 찜/리뷰 작성 등) 열 수 있도록 전역 상태로 끌어올린 컨텍스트.
export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <AuthModalContext.Provider value={{ openAuthModal: () => setOpen(true) }}>
      {children}
      <AuthModal open={open} onClose={() => setOpen(false)} />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal은 AuthModalProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
