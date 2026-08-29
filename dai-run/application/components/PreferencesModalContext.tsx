'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type PreferencesModalContextValue = {
  open: boolean;
  openPreferencesModal: () => void;
  closePreferencesModal: () => void;
};

const PreferencesModalContext = createContext<PreferencesModalContextValue | null>(null);

export function PreferencesModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <PreferencesModalContext.Provider
      value={{ open, openPreferencesModal: () => setOpen(true), closePreferencesModal: () => setOpen(false) }}
    >
      {children}
    </PreferencesModalContext.Provider>
  );
}

export function usePreferencesModal() {
  const ctx = useContext(PreferencesModalContext);
  if (!ctx) throw new Error('usePreferencesModal은 PreferencesModalProvider 안에서만 사용할 수 있어요.');
  return ctx;
}
