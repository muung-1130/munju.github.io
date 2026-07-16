'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { AssistantChatWidget } from './AssistantChatWidget';
import { AuthModal } from './AuthModal';
import { CompleteProfileModal } from './CompleteProfileModal';

const navItems = [
  { href: '/', label: '홈' },
  { href: '/courses', label: '코스 탐색' },
  { href: '/crew', label: '러닝크루' },
  { href: '/challenges', label: '챌린지' },
  { href: '/marathon', label: '마라톤' },
  { href: '/shoes', label: '러닝화' },
  { href: '/mypage', label: '마이페이지' }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session, update } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="top-nav">
        <Link href="/" className="brand" aria-label="DAI RUN 홈">
          <span className="brand-mark">D</span>
          <span className="brand-text">DAI RUN</span>
        </Link>

        <nav className="nav-menu" aria-label="주요 메뉴">
          {navItems.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            // /mypage는 middleware에서 로그인 여부로 분기하므로, 로그아웃 상태에서 미리
            // prefetch된 리다이렉트 결과가 로그인 후에도 캐시되어 재사용되지 않도록 prefetch를 끈다.
            const prefetch = item.href === '/mypage' ? false : undefined;
            return (
              <Link key={item.href} href={item.href} prefetch={prefetch} className={`nav-link ${active ? 'active' : ''}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="nav-actions">
          {session && <span className="nav-username">{session.user?.name}님</span>}
          <button aria-label="알림">🔔</button>
          <button aria-label="메시지">💬</button>
          <div className="profile-menu-wrap">
            <button
              aria-label="프로필"
              onClick={() => (session ? setProfileMenuOpen((prev) => !prev) : setAuthOpen(true))}
            >
              👤
            </button>
            {session && profileMenuOpen && (
              <div className="profile-menu">
                <strong>{session.user?.name}님</strong>
                <button onClick={() => signOut({ callbackUrl: '/' })}>로그아웃</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="page-wrap">{children}</main>
      <AssistantChatWidget />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      {session?.user && session.user.profileComplete === false && (
        <CompleteProfileModal currentNickname={session.user.name} onDone={() => update()} />
      )}
    </div>
  );
}
