'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
<<<<<<< HEAD
import { useChat } from './ChatContext';
=======

type ChatMessage = { from: 'ai' | 'user'; text: string };

const initialMessages: ChatMessage[] = [
  { from: 'ai', text: '안녕하세요! 오늘 컨디션에 맞는 코스를 추천해드릴까요?' },
  { from: 'user', text: '네 좋아요, 오늘은 18km 정도 뛰고 싶어요.' },
  { from: 'ai', text: '반포 한강공원 18.2km 코스가 딱이에요! 경사도도 완만해서 부담 없이 달릴 수 있어요 💙' }
];
>>>>>>> origin/main

// 특정 페이지에 처음 들어왔을 때 AI가 추가로 건네는 말 (페이지당 세션에 한 번)
const pageEntryMessages: Record<string, string> = {
  '/challenges': "지금 5월 100K 챌린지 62.1/100km, 62% 달성했어요! 이 페이스라면 주 3회, 회당 4.9km만 더 뛰어도 D-18 안에 목표를 달성할 수 있어요. 💡 보폭을 5cm만 늘려보세요! 마라토너의 보폭을 따라잡을 수 있어요."
};

<<<<<<< HEAD
const ICON_SIZE = 56;

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

  useEffect(() => {
    if (!iconPos) setIconPos(clampPosition(defaultIconPosition()));

    function handleResize() {
      if (draggedRef.current) return; // 사용자가 직접 옮긴 뒤에는 리사이즈로 위치를 되돌리지 않는다.
      setIconPos(clampPosition(defaultIconPosition()));
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

=======
export function AssistantChatWidget() {
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const coachedPathsRef = useRef(new Set<string>());

>>>>>>> origin/main
  useEffect(() => {
    const entryMessage = pageEntryMessages[pathname];
    if (entryMessage && !coachedPathsRef.current.has(pathname)) {
      coachedPathsRef.current.add(pathname);
<<<<<<< HEAD
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
=======
      setMessages((prev) => [...prev, { from: 'ai', text: entryMessage }]);
    }
  }, [pathname]);

  const lastAiMessage = [...messages].reverse().find((message) => message.from === 'ai');
>>>>>>> origin/main

  function handleSend() {
    const text = input.trim();
    if (!text) return;
<<<<<<< HEAD
    addMessage({ from: 'user', text });
    setInput('');
    setTimeout(() => {
      addMessage({ from: 'ai', text: '네, 확인했어요! 잠시 후 답변 드릴게요 🏃' });
    }, 600);
  }

  return (
    <>
      {!open && bubbleMessage && (
        <div className="home-chat-bubble-top" onClick={openChat} role="button" tabIndex={0}>
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

      <aside className={`home-chat-panel ${open ? 'open' : ''}`} aria-label="AI 러닝 비서 채팅" aria-hidden={!open}>
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
=======
    setMessages((prev) => [...prev, { from: 'user', text }]);
    setInput('');
    setTimeout(() => {
      setMessages((prev) => [...prev, { from: 'ai', text: '네, 확인했어요! 잠시 후 답변 드릴게요 🏃' }]);
    }, 600);
  }

  if (!open) {
    return (
      <div className="home-chat-collapsed">
        <div className="home-chat-bubble">
          <p>{lastAiMessage?.text}</p>
        </div>
        <button className="home-chat-toggle" onClick={() => setOpen(true)} aria-label="AI 러닝 비서 채팅 열기">
          <img src="/assets/dog-assistant.png" alt="" />
        </button>
      </div>
    );
  }

  return (
    <aside className="home-chat-panel" aria-label="AI 러닝 비서 채팅">
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
>>>>>>> origin/main
  );
}
