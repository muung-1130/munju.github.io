'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useChat } from './ChatContext';

// 특정 페이지에 처음 들어왔을 때 AI가 추가로 건네는 말 (페이지당 세션에 한 번)
const pageEntryMessages: Record<string, string> = {
  '/': '제가 추천하고 싶은 신상 코스 3가지인데 어때요?',
  '/challenges': "지금 5월 100K 챌린지 62.1/100km, 62% 달성했어요! 이 페이스라면 주 3회, 회당 4.9km만 더 뛰어도 D-18 안에 목표를 달성할 수 있어요. 💡 보폭을 5cm만 늘려보세요! 마라토너의 보폭을 따라잡을 수 있어요."
};

const ICON_SIZE = 56;
const MIN_PANEL_WIDTH = 340;
const MAX_PANEL_WIDTH = 920;
const MIN_PANEL_HEIGHT = 420;
const MAX_PANEL_HEIGHT_MARGIN = 40; // 뷰포트 상하 여백

function defaultIconPosition() {
  // 기본 위치: 네비게이션의 "마이페이지" 링크 바로 오른쪽. 아직 렌더되지 않았거나 찾지 못하면
  // 화면 우상단 근처로 대체한다.
  const navLink = document.querySelector('[data-nav-mypage]');
  if (navLink) {
    const rect = navLink.getBoundingClientRect();
    return { top: rect.top + rect.height / 2 - ICON_SIZE / 2, left: rect.right + 14 };
  }
  return { top: 20, left: Math.max(20, window.innerWidth - 260) };
}

function clampPosition(pos: { top: number; left: number }) {
  return {
    top: Math.min(Math.max(pos.top, 8), window.innerHeight - ICON_SIZE - 8),
    left: Math.min(Math.max(pos.left, 8), window.innerWidth - ICON_SIZE - 8)
  };
}

export function AssistantChatWidget() {
  const pathname = usePathname();
  const { open, setOpen, openChat, messages, addMessage, bubbleMessage } = useChat();
  const [input, setInput] = useState('');
  const coachedPathsRef = useRef(new Set<string>());

  const [iconPos, setIconPos] = useState<{ top: number; left: number } | null>(null);
  const draggedRef = useRef(false);
  const draggingRef = useRef(false);
  const [panelSize, setPanelSize] = useState<{ width: number; height: number } | null>(null);
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

  useEffect(() => {
    const entryMessage = pageEntryMessages[pathname];
    if (entryMessage && !coachedPathsRef.current.has(pathname)) {
      coachedPathsRef.current.add(pathname);
      addMessage({ from: 'ai', text: entryMessage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    addMessage({ from: 'user', text });
    setInput('');
    setTimeout(() => {
      addMessage({ from: 'ai', text: '네, 확인했어요! 잠시 후 답변 드릴게요 🏃' });
    }, 600);
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
          <img src="/assets/dog-assistant.png" alt="" />
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
          <span className="ai-avatar-small"><img src="/assets/dog-assistant.png" alt="" /></span>
          <div>
            <strong>AI 러닝 비서</strong>
            <small>언제든 편하게 물어보세요</small>
          </div>
          <button className="home-chat-close" onClick={() => setOpen(false)} aria-label="채팅 닫기">✕</button>
        </div>
        <div className="home-chat-list">
          {messages.map((message, index) => (
            <div key={index} className={`home-chat-line ${message.from}`}>
              {message.from === 'ai' && <span className="avatar-dot">🐶</span>}
              <p>{message.text}</p>
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
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="AI 러닝 비서에게 물어보세요..." />
          <button type="submit" aria-label="전송">➤</button>
        </form>
      </aside>
    </>
  );
}
