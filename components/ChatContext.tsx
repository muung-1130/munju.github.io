'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type ChatMessage = { from: 'ai' | 'user'; text: string };

const initialMessages: ChatMessage[] = [
  { from: 'ai', text: '안녕하세요! 오늘 컨디션에 맞는 코스를 추천해드릴까요?' },
  { from: 'user', text: '네 좋아요, 오늘은 18km 정도 뛰고 싶어요.' },
  { from: 'ai', text: '반포 한강공원 18.2km 코스가 딱이에요! 경사도도 완만해서 부담 없이 달릴 수 있어요 💙' }
];

const BUBBLE_VISIBLE_MS = 5000;

type ChatContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openChat: () => void;
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  bubbleMessage: string | null;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [bubbleMessage, setBubbleMessage] = useState<string | null>(null);
  const seenMessageCountRef = useRef(0);

  function addMessage(message: ChatMessage) {
    setMessages((prev) => [...prev, message]);
  }

  function openChat() {
    setOpen(true);
    setBubbleMessage(null);
  }

  // 메시지 목록에 AI의 새 발화가 추가될 때만(최초 진입 포함) 말풍선을 띄운다.
  useEffect(() => {
    if (messages.length <= seenMessageCountRef.current) return;
    const newest = messages[messages.length - 1];
    seenMessageCountRef.current = messages.length;
    if (newest.from === 'ai' && !open) {
      setBubbleMessage(newest.text);
    }
  }, [messages, open]);

  // 말풍선은 5초 뒤 자동으로 사라진다. 타이머를 bubbleMessage 자체에 묶어서(ref로 직접 관리하지
  // 않음) React StrictMode의 개발 모드 이펙트 이중 실행과 충돌 없이 항상 자기 타이머만 정리한다.
  useEffect(() => {
    if (!bubbleMessage) return;
    const timer = setTimeout(() => setBubbleMessage(null), BUBBLE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [bubbleMessage]);

  return (
    <ChatContext.Provider value={{ open, setOpen, openChat, messages, addMessage, bubbleMessage }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat은 ChatProvider 안에서만 사용할 수 있어요.');
  return ctx;
}
