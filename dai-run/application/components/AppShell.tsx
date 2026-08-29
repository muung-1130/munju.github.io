'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { AssistantChatWidget } from './AssistantChatWidget';
import { CompleteProfileModal } from './CompleteProfileModal';
import { EditProfileModal } from './EditProfileModal';
import { ChatProvider, useChat } from './ChatContext';
import { AuthModalProvider, useAuthModal } from './AuthModalContext';
import { CrewChatProvider, useCrewChat } from './CrewChatContext';
import { CrewChatWidget } from './CrewChatWidget';
import { PreferencesModalProvider } from './PreferencesModalContext';
import { RunningPreferencesOnboardingModal } from './RunningPreferencesOnboardingModal';

// 네비게이션 우측 상단 아이콘 3개(알림/고객센터/프로필)는 이모지 대신 단색 SVG로 그린다.
function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

const navItems = [
  { href: '/', label: '홈' },
  { href: '/courses', label: '코스 탐색' },
  { href: '/crew', label: '러닝크루' },
  { href: '/challenges', label: '챌린지' },
  { href: '/marathon', label: '마라톤' },
  { href: '/shoes', label: '러닝화' },
  { href: '/mypage', label: '마이페이지' }
];

type AppNotification = {
  notificationId: string;
  notificationType: string;
  title: string;
  body: string;
  targetUrl: string | null;
  referenceType: string | null;
  referenceId: string | null;
  crewName: string | null;
  joinRequestMessage: string | null;
  applicantNickname: string | null;
};

// 크루 가입 신청/승인 알림은 더 이상 crew_join_requests/crew_members를 그때그때 다시 조회해서
// 만들지 않는다 — 신청/승인 API가 Kafka로 이벤트를 흘려보내면 별도 consumer(crew-notification-consumer)가
// notification.notifications에 미리 적재해두고, 여기서는 그 결과만 폴링해서 보여준다.
function NotificationBell({ session }: { session: ReturnType<typeof useSession>['data'] }) {
  const { openCrewChat } = useCrewChat();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    if (!session?.user) return;
    const res = await fetch('/api/notifications');
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  function dismiss(notificationId: string) {
    setNotifications((prev) => prev.filter((n) => n.notificationId !== notificationId));
    fetch(`/api/notifications/${notificationId}/read`, { method: 'POST' }).catch(() => {});
  }

  async function decide(notification: AppNotification, approve: boolean) {
    if (!notification.referenceId) return;
    setBusyId(notification.notificationId);
    try {
      const res = await fetch(`/api/crew/join-requests/${notification.referenceId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve })
      });
      if (res.ok) dismiss(notification.notificationId);
    } finally {
      setBusyId(null);
    }
  }

  async function enterChat(notification: AppNotification) {
    if (!notification.referenceId) return;
    setBusyId(notification.notificationId);
    try {
      const res = await fetch(`/api/crew/${notification.referenceId}/chat/join`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        openCrewChat(notification.referenceId, notification.crewName ?? '크루', data.messages ?? []);
        dismiss(notification.notificationId);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="profile-menu-wrap" ref={ref}>
      <button aria-label="알림" onClick={() => setOpen((v) => !v)} style={{ position: 'relative' }}>
        <BellIcon />
        {notifications.length > 0 && <span className="notification-badge">{notifications.length}</span>}
      </button>
      {open && (
        <div className="profile-menu notification-menu">
          <strong>알림</strong>
          {notifications.length === 0 ? (
            <p className="muted" style={{ margin: '10px 0' }}>새 알림이 없어요.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.notificationId} className="notification-item">
                {n.notificationType === 'CREW_JOIN_REQUESTED' ? (
                  <>
                    <p>
                      <b>{n.applicantNickname}</b>님이 <b>{n.crewName}</b>에 가입 신청했어요.
                    </p>
                    {n.joinRequestMessage && <p className="notification-message">“{n.joinRequestMessage}”</p>}
                    <div className="notification-actions">
                      <button className="ghost-btn" disabled={busyId === n.notificationId} onClick={() => decide(n, false)}>
                        거절
                      </button>
                      <button className="primary-btn" disabled={busyId === n.notificationId} onClick={() => decide(n, true)}>
                        승인
                      </button>
                    </div>
                  </>
                ) : n.notificationType === 'CREW_JOIN_APPROVED' ? (
                  <>
                    <p>
                      <b>{n.title}</b>
                    </p>
                    <p className="notification-message">{n.body}</p>
                    <div className="notification-actions">
                      <button className="ghost-btn" disabled={busyId === n.notificationId} onClick={() => dismiss(n.notificationId)}>
                        나중에
                      </button>
                      <button className="primary-btn" disabled={busyId === n.notificationId} onClick={() => enterChat(n)}>
                        채팅방 입장하기
                      </button>
                    </div>
                  </>
                ) : n.targetUrl ? (
                  <Link href={n.targetUrl} className="notification-link" onClick={() => dismiss(n.notificationId)}>
                    <p>
                      <b>{n.title}</b>
                    </p>
                    <p className="notification-message">{n.body}</p>
                  </Link>
                ) : (
                  <p>{n.body}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, update } = useSession();
  const { open: chatOpen, openChat } = useChat();
  const { crewId, crewName, setOpen: setCrewChatOpen } = useCrewChat();
  const { openAuthModal } = useAuthModal();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // 페이지 이동 시 모바일 메뉴는 항상 닫아둔다.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    // NextAuth는 쿠키만 지우고 auth_user.auth_sessions 행은 회수하지 않으므로, 로그아웃 직전에
    // 이 세션을 명시적으로 revoke해서 "로그아웃해도 세션이 계속 쌓이기만 하는" 문제를 막는다.
    await fetch('/api/auth/revoke-session', { method: 'POST' }).catch(() => {});
    // signOut({ callbackUrl })은 서버(NEXTAUTH_URL) 기준으로 리다이렉트 주소를 계산한다 —
    // 지금 접속한 주소와 NEXTAUTH_URL(구글 로그인 때문에 localhost로 맞춰둠)이 다르면 로그아웃
    // 후 쿠키도 없는 엉뚱한 origin으로 튕겨나가 Unauthorized가 뜬다. redirect:false로 자동
    // 이동을 막고 지금 보고 있는 주소 기준으로 직접 이동시킨다.
    await signOut({ redirect: false });
    window.location.href = '/';
  }

  useEffect(() => {
    if (!profileMenuOpen) return;
    function handleOutsideClick(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [profileMenuOpen]);

  return (
    <div className={`app-shell ${chatOpen ? 'chat-open' : ''}`}>
      <header className={`top-nav ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}>
        <div className="top-nav-row1">
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            <span />
            <span />
            <span />
          </button>

          <Link href="/" className="brand" aria-label="DAI RUN 홈">
            <Image src="/assets/logo-fixed-color.png" alt="" width={36} height={36} className="brand-mark" priority />
            <span className="brand-text">DAI RUN</span>
          </Link>

          {/* AI 러닝 비서/크루 채팅은 예전엔 화면 위에 항상 떠 있는 드래그 가능한 원형 버튼으로
              열었다 — 페이지 내용 위에 계속 겹쳐 보인다는 피드백으로, 헤더 안 고정 아이콘으로
              옮겨서 로고와 같은 줄에 정리한다. 크루 채팅은 크루 채팅방에 들어가 있을 때만 보인다. */}
          <div className="header-chat-icons">
            <button type="button" className="header-chat-icon-btn" onClick={openChat} aria-label="AI 러닝 비서 열기">
              <img src="/assets/ai-bot-rabbit.png" alt="" />
            </button>
            {crewId && (
              <button
                type="button"
                className="header-chat-icon-btn crew"
                onClick={() => setCrewChatOpen(true)}
                aria-label={`${crewName ?? '크루'} 채팅 열기`}
              >
                <img src="/assets/crew-chat-shield.svg" alt="" />
              </button>
            )}
          </div>
        </div>

        {/* 데스크톱에서는 display:contents로 nav-menu/nav-actions가 각자 order값대로 header의
            flex 아이템이 되고, 모바일에서는 이 div 자체가 좌측에서 슬라이드해 들어오는
            드로어가 된다(예전엔 헤더 아래로 펼쳐지며 본문을 밀어내렸다). */}
        <div className="mobile-nav-drawer">
          <nav className="nav-menu" aria-label="주요 메뉴">
            {(session?.user?.isAdmin ? [...navItems, { href: '/admin', label: '관리자' }] : navItems).map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              // /mypage는 middleware에서 로그인 여부로 분기하므로, 로그아웃 상태에서 미리
              // prefetch된 리다이렉트 결과가 로그인 후에도 캐시되어 재사용되지 않도록 prefetch를 끈다.
              const prefetch = item.href === '/mypage' ? false : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={prefetch}
                  className={`nav-link ${active ? 'active' : ''}`}
                  data-nav-mypage={item.href === '/mypage' ? true : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="nav-actions">
            {session && <span className="nav-username">{session.user?.name}님</span>}
            <NotificationBell session={session} />
            <Link href="/support" className="nav-icon-link" aria-label="고객센터"><ChatIcon /></Link>
            <div className="profile-menu-wrap" ref={profileMenuRef}>
              <button
                aria-label="프로필"
                onClick={() => (session ? setProfileMenuOpen((prev) => !prev) : openAuthModal())}
              >
                <ProfileIcon />
              </button>
              {session && profileMenuOpen && (
                <div className="profile-menu">
                  <strong>{session.user?.name}님</strong>
                  <button
                    onClick={() => {
                      setEditProfileOpen(true);
                      setProfileMenuOpen(false);
                    }}
                  >
                    회원정보 수정
                  </button>
                  <button onClick={handleSignOut}>로그아웃</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="mobile-nav-backdrop" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
      )}

      <main className="page-wrap">{children}</main>
      <AssistantChatWidget />
      <CrewChatWidget />
      <RunningPreferencesOnboardingModal />
      {session?.user && session.user.profileComplete === false && (
        <CompleteProfileModal currentNickname={session.user.name} onDone={() => update()} />
      )}
      {editProfileOpen && (
        <EditProfileModal
          onClose={() => setEditProfileOpen(false)}
          onSaved={async () => {
            await update();
            setEditProfileOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

export function AppShell({ children, demoLoginEnabled }: { children: ReactNode; demoLoginEnabled?: boolean }) {
  return (
    <ChatProvider>
      <AuthModalProvider demoLoginEnabled={demoLoginEnabled}>
        <CrewChatProvider>
          <PreferencesModalProvider>
            <AppShellInner>{children}</AppShellInner>
          </PreferencesModalProvider>
        </CrewChatProvider>
      </AuthModalProvider>
    </ChatProvider>
  );
}
