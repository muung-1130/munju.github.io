'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type ChatMessage = { from: 'ai' | 'user'; text: string };

const initialMessages: ChatMessage[] = [
  { from: 'ai', text: '안녕하세요! 오늘 컨디션에 맞는 코스를 추천해드릴까요?' },
  { from: 'user', text: '네 좋아요, 오늘은 18km 정도 뛰고 싶어요.' },
  { from: 'ai', text: '반포 한강공원 18.2km 코스가 딱이에요! 경사도도 완만해서 부담 없이 달릴 수 있어요 💙' }
];

// 특정 페이지에 처음 들어왔을 때 AI가 추가로 건네는 말 (페이지당 세션에 한 번)
const pageEntryMessages: Record<string, string> = {
  '/challenges': "지금 5월 100K 챌린지 62.1/100km, 62% 달성했어요! 이 페이스라면 주 3회, 회당 4.9km만 더 뛰어도 D-18 안에 목표를 달성할 수 있어요. 💡 보폭을 5cm만 늘려보세요! 마라토너의 보폭을 따라잡을 수 있어요."
};

export function AssistantChatWidget() {
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const coachedPathsRef = useRef(new Set<string>());

  useEffect(() => {
    const entryMessage = pageEntryMessages[pathname];
    if (entryMessage && !coachedPathsRef.current.has(pathname)) {
      coachedPathsRef.current.add(pathname);
      setMessages((prev) => [...prev, { from: 'ai', text: entryMessage }]);
    }
  }, [pathname]);

  const lastAiMessage = [...messages].reverse().find((message) => message.from === 'ai');

  function handleSend() {
    const text = input.trim();
    if (!text) return;
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
  );
}
