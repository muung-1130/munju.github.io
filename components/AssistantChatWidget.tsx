'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useChat } from './ChatContext';

const ASSISTANT_MESSAGE_POLL_MS = 15000;

// 특정 페이지에 처음 들어왔을 때 AI가 추가로 건네는 말 (브라우저 세션당 한 번).
// '/challenges'용으로 있던 고정 문구("5월 100K 챌린지 62.1/100km...")는 실제 챌린지 데이터와
// 무관한 가짜 수치였어서 제거했다 — 실제 진행률은 마이페이지/챌린지 상세에 이미 표시된다.
const pageEntryMessages: Record<string, string> = {
  '/': '제가 추천하고 싶은 신상 코스 3가지인데 어때요?'
};
const PAGE_ENTRY_SEEN_KEY = 'aiAssistantPageEntrySeen';
const LAST_SEEN_MESSAGE_KEY_PREFIX = 'aiAssistantLastSeenMessageAt:';
const SEEN_MESSAGE_IDS_KEY_PREFIX = 'aiAssistantSeenMessageIds:';
// 이 탭에서 폴링을 시작한 사용자 id를 기억해둔다(세션스토리지라 탭을 닫으면 사라진다). 지금
// 로그인한 사용자가 이 값과 다르면(로그아웃 후 재로그인 포함) 새로 로그인한 시점으로 보고
// lastSeenKey를 "지금"으로 리셋한다 — 안 그러면 그 이전에 쌓여있던 오래된 메시지(러닝 완료
// 축하 등)가 로그인할 때마다 다시 쏟아진다.
const POLL_SESSION_USER_KEY = 'aiAssistantPollSessionUserId';
const MAX_SEEN_MESSAGE_IDS = 200;

const ICON_SIZE = 56;
const MIN_PANEL_WIDTH = 340;
const MAX_PANEL_WIDTH = 920;
const MIN_PANEL_HEIGHT = 420;
const MAX_PANEL_HEIGHT_MARGIN = 40; // 뷰포트 상하 여백

// 채팅 진입 버튼의 기본 가로 위치는 화면 우측 2/3 지점으로 둔다. 세로 위치만 네비게이션의
// "마이페이지" 링크에 맞춰두고(아직 렌더되지 않았으면 상단 근처로 대체), 렌더가 지연되는
// 흐름에서도 값이 흔들리지 않게 한다.
function defaultIconPosition() {
  const navLink = document.querySelector('[data-nav-mypage]');
  const top = navLink ? navLink.getBoundingClientRect().top + navLink.getBoundingClientRect().height / 2 - ICON_SIZE / 2 : 20;
  return { top, left: (window.innerWidth * 2) / 3 };
}

function clampPosition(pos: { top: number; left: number }) {
  return {
    top: Math.min(Math.max(pos.top, 8), window.innerHeight - ICON_SIZE - 8),
    left: Math.min(Math.max(pos.left, 8), window.innerWidth - ICON_SIZE - 8)
  };
}

export function AssistantChatWidget() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { open, setOpen, openChat, messages, addMessage, bubbleMessage, showEphemeralBubble } = useChat();
  const [input, setInput] = useState('');
  const coachedPathsRef = useRef(new Set<string>());
  const lastSeenAssistantMessageAtRef = useRef<string | null>(null);
  const seenAssistantMessageIdsRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef(false);
  const bedrockSessionIdRef = useRef<string | null>(null);
  const [sending, setSending] = useState(false);

  const [iconPos, setIconPos] = useState<{ top: number; left: number } | null>(null);
  const draggedRef = useRef(false);
  const draggingRef = useRef(false);
  const [panelSize, setPanelSize] = useState<{ width: number; height: number } | null>(null);
  const chatListRef = useRef<HTMLDivElement>(null);

  // 채팅창을 열 때와 새 메시지가 도착할 때 항상 맨 아래(최신 메시지)부터 보이게 한다.
  useEffect(() => {
    if (!open) return;
    const el = chatListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages]);
  // 모바일에서는 헤더가 로고줄+네비게이션줄로 줄바꿈되어 높이가 유동적이라, 말풍선의 top을
  // CSS 고정값 대신 실제 헤더 높이를 측정해서 그 바로 아래에 뜨도록 한다.
  const [mobileBubbleTop, setMobileBubbleTop] = useState<number | null>(null);

  // 패널 우하단 모서리를 오른쪽 화면 끝에 고정해둔 채, 왼쪽/아래로 끄는 만큼 너비·높이를 키운다
  // (패널이 화면 오른쪽에 붙어 있어서 오른쪽/위로는 늘어날 자리가 없다).
  function handleResizeMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const panelEl = (event.currentTarget.parentElement as HTMLElement) ?? null;
    const startWidth = panelEl?.offsetWidth ?? MIN_PANEL_WIDTH;
    const startHeight = panelEl?.offsetHeight ?? MIN_PANEL_HEIGHT;
    const startX = event.clientX;
    const startY = event.clientY;
    const maxHeight = window.innerHeight - MAX_PANEL_HEIGHT_MARGIN;

    function handleMouseMove(moveEvent: MouseEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const width = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth - dx));
      const height = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, startHeight + dy));
      setPanelSize({ width, height });
    }
    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  useEffect(() => {
    if (!iconPos) setIconPos(clampPosition(defaultIconPosition()));

    function updateMobileBubbleTop() {
      if (window.innerWidth > 760) {
        setMobileBubbleTop(null);
        return;
      }
      const header = document.querySelector('.top-nav');
      setMobileBubbleTop(header ? header.getBoundingClientRect().bottom + 12 : null);
    }

    function handleResize() {
      if (!draggedRef.current) setIconPos(clampPosition(defaultIconPosition())); // 사용자가 직접 옮긴 뒤에는 리사이즈로 위치를 되돌리지 않는다.
      updateMobileBubbleTop();
    }
    updateMobileBubbleTop();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // coachedPathsRef가 컴포넌트 인스턴스에만 붙어있던 메모리 상태라, 새로고침/재진입마다
  // AppShell이 다시 마운트되면서 매번 "처음 들어온 것"으로 착각해 같은 말을 반복했다.
  // sessionStorage에 남겨서 같은 브라우저 세션에서는 페이지당 한 번만 뜨게 한다.
  useEffect(() => {
    const entryMessage = pageEntryMessages[pathname];
    if (!entryMessage || coachedPathsRef.current.has(pathname)) return;
    let seenPaths: string[] = [];
    try {
      seenPaths = JSON.parse(sessionStorage.getItem(PAGE_ENTRY_SEEN_KEY) ?? '[]');
    } catch {
      seenPaths = [];
    }
    coachedPathsRef.current.add(pathname);
    if (seenPaths.includes(pathname)) return;
    sessionStorage.setItem(PAGE_ENTRY_SEEN_KEY, JSON.stringify([...seenPaths, pathname]));
    showEphemeralBubble(entryMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // 러닝 완료 축하 메시지 등 서버(run-completion-consumer 경유)가 비동기로 남긴 AI 메시지를
  // 주기적으로 가져와 말풍선으로 띄운다 — 로그인 상태에서만 폴링한다.
  //
  // 진짜 근본 원인: PostgreSQL timestamptz는 마이크로초 정밀도지만, pg 드라이버가 이걸 JS
  // Date로 파싱하는 순간(Date는 밀리초까지만 표현 가능) 마이크로초가 잘려나간다. 그래서
  // "마지막으로 본 시각"을 그 잘린 값으로 저장해두면, 서버가 `created_at > since`로 비교할 때
  // 원본(마이크로초 포함) 값이 잘린 값보다 항상 커서 같은 메시지가 폴링마다(15초 간격 + 새로고침
  // 때마다) 영원히 다시 조회됐다 — "챗봇이 모든 말을 계속 반복한다"는 증상의 진짜 원인.
  // 시각 커서만으로는 이 정밀도 문제를 못 피하므로, messageId 자체를 남겨서 한 번 보여준
  // 메시지는 시각 비교 결과와 무관하게 다시 추가하지 않는다. sessionStorage(탭 닫으면 초기화)에
  // 두면 새 브라우저 세션마다 과거 메시지가 전부 "새 메시지"로 다시 쏟아지므로, 브라우저를
  // 껐다 켜도 유지되는 localStorage에 저장한다 — 한 번 본 메시지는 이후 어떤 세션에서도 다시
  // 뜨지 않아야 한다.
  useEffect(() => {
    if (!session?.user) return;
    const lastSeenKey = `${LAST_SEEN_MESSAGE_KEY_PREFIX}${session.user.id}`;
    const seenIdsKey = `${SEEN_MESSAGE_IDS_KEY_PREFIX}${session.user.id}`;

    // 이 탭에서 방금 새로 로그인한 시점이면(이전에 폴링을 시작한 사용자와 다르면) 커서를 지금
    // 시각으로 리셋한다 — 그러지 않으면 localStorage에 남아있던 오래된 커서 때문에 예전에 쌓인
    // 메시지 전부가 "since 이후 메시지"로 잡혀 로그인 직후 한꺼번에 다시 나타난다.
    if (sessionStorage.getItem(POLL_SESSION_USER_KEY) !== session.user.id) {
      sessionStorage.setItem(POLL_SESSION_USER_KEY, session.user.id);
      localStorage.setItem(lastSeenKey, new Date().toISOString());
    }

    lastSeenAssistantMessageAtRef.current = localStorage.getItem(lastSeenKey);
    try {
      const storedIds = JSON.parse(localStorage.getItem(seenIdsKey) ?? '[]');
      if (Array.isArray(storedIds)) seenAssistantMessageIdsRef.current = new Set(storedIds);
    } catch {
      // 손상된 값이면 빈 집합으로 시작한다.
    }

    let cancelled = false;
    async function poll() {
      // session?.user?.id가 로딩 중 여러 번 바뀌면서 이 effect 자체가 짧은 간격으로 두 번
      // 재실행되는 경우가 있었다 — 그때 이전 poll()의 fetch가 아직 진행 중이면 같은 since로
      // 겹쳐서 다시 요청해 같은 메시지를 두 번 addMessage하게 됐다. 뮤텍스로 겹침을 막는다.
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const params = lastSeenAssistantMessageAtRef.current ? `?since=${encodeURIComponent(lastSeenAssistantMessageAtRef.current)}` : '';
        const res = await fetch(`/api/ai-assistant/messages${params}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        for (const message of data.messages ?? []) {
          if (seenAssistantMessageIdsRef.current.has(message.messageId)) continue;
          seenAssistantMessageIdsRef.current.add(message.messageId);
          const idList = Array.from(seenAssistantMessageIdsRef.current).slice(-MAX_SEEN_MESSAGE_IDS);
          localStorage.setItem(seenIdsKey, JSON.stringify(idList));
          addMessage({ from: 'ai', text: message.content });
          lastSeenAssistantMessageAtRef.current = message.createdAt;
          localStorage.setItem(lastSeenKey, message.createdAt);
        }
      } catch {
        // 폴링 실패는 조용히 넘어가고 다음 주기에 다시 시도한다.
      } finally {
        pollingRef.current = false;
      }
    }

    poll();
    const timer = setInterval(poll, ASSISTANT_MESSAGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  function handleIconMouseDown(event: React.MouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startPos = iconPos ?? defaultIconPosition();
    draggingRef.current = false;

    function handleMouseMove(moveEvent: MouseEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) draggingRef.current = true;
      setIconPos(clampPosition({ top: startPos.top + dy, left: startPos.left + dx }));
    }
    function handleMouseUp() {
      if (draggingRef.current) draggedRef.current = true;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleIconClick() {
    if (draggingRef.current) {
      draggingRef.current = false;
      return;
    }
    openChat();
  }

  function getCurrentCoords(): Promise<{ latitude: number; longitude: number } | null> {
    if (!navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 3000 }
      );
    });
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    addMessage({ from: 'user', text });
    setInput('');
    setSending(true);
    try {
      const coords = await getCurrentCoords();
      const res = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          sessionId: bedrockSessionIdRef.current,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null
        })
      });
      if (!res.ok) throw new Error('request failed');
      const data = await res.json();
      if (data.sessionId) bedrockSessionIdRef.current = data.sessionId;
      addMessage({ from: 'ai', text: data.answer || '답변을 가져오지 못했어요.' });
    } catch {
      addMessage({ from: 'ai', text: '죄송해요, 지금은 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!open && bubbleMessage && (
        <div
          className="home-chat-bubble-top"
          style={mobileBubbleTop !== null ? { top: mobileBubbleTop } : undefined}
          onClick={openChat}
          role="button"
          tabIndex={0}
        >
          <p>{bubbleMessage}</p>
        </div>
      )}

      {!open && iconPos && (
        <button
          className="home-chat-toggle"
          style={{ top: iconPos.top, left: iconPos.left }}
          onMouseDown={handleIconMouseDown}
          onClick={handleIconClick}
          aria-label="AI 러닝 비서 채팅 열기 (드래그해서 위치를 옮길 수 있어요)"
        >
          <img src="/assets/ai-bot-turtle.svg" alt="" />
        </button>
      )}

      <aside
        className={`home-chat-panel ${open ? 'open' : ''}`}
        style={panelSize ? { width: panelSize.width, height: panelSize.height } : undefined}
        aria-label="AI 러닝 비서 채팅"
        aria-hidden={!open}
      >
        <div className="home-chat-resize-handle" onMouseDown={handleResizeMouseDown} aria-hidden="true" />
        <div className="home-chat-header">
          <span className="ai-avatar-small"><img src="/assets/ai-bot-turtle.svg" alt="" /></span>
          <div>
            <strong>AI 러닝 비서</strong>
            <small>언제든 편하게 물어보세요</small>
          </div>
          <button className="home-chat-close" onClick={() => setOpen(false)} aria-label="채팅 닫기">✕</button>
        </div>
        <div className="home-chat-list" ref={chatListRef}>
          {messages.map((message, index) => (
            <div key={index} className={`home-chat-line ${message.from}`}>
              {message.from === 'ai' && (
                <span className="avatar-dot">
                  <img src="/assets/ai-bot-turtle.svg" alt="" />
                </span>
              )}
              <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
            </div>
          ))}
        </div>
        <form
          className="chat-input"
          onSubmit={(event) => {
            event.preventDefault();
            handleSend();
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={sending ? 'AI 러닝 비서가 답변을 준비하고 있어요...' : 'AI 러닝 비서에게 물어보세요...'}
            disabled={sending}
          />
          <button type="submit" aria-label="전송" disabled={sending}>➤</button>
        </form>
      </aside>
    </>
  );
}
