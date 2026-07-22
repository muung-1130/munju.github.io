'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';

export type ChatMessage = { from: 'ai' | 'user'; text: string };

function greetingMessage(name: string): ChatMessage {
  return { from: 'ai', text: `안녕하세요, ${name}님! 저는 ${name}님의 러닝 비서에요! 무엇이든 물어봐주세요!` };
}

const BUBBLE_VISIBLE_MS = 5000;
const STORAGE_KEY = 'aiAssistantMessages';
const MAX_STORED_MESSAGES = 50;

type ChatContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openChat: () => void;
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  bubbleMessage: string | null;
};

const ChatContext = createContext<ChatContextValue | null>(null);

const FALLBACK_GREETING = greetingMessage('러너');

export function ChatProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  // 서버/클라이언트 첫 렌더가 항상 같은 값이어야 hydration mismatch가 안 나므로, sessionStorage나
  // session을 들여다보지 않는 고정 인사말로 시작한다(닉네임은 아래 effect에서 알게 되는 대로 바꿔치기).
  const [messages, setMessages] = useState<ChatMessage[]>([FALLBACK_GREETING]);
  const [bubbleMessage, setBubbleMessage] = useState<string | null>(null);
  const seenMessageCountRef = useRef(1);

  // messages가 컴포넌트 메모리(useState 초기값)에만 있어서 새로고침/재진입마다 그동안
  // 실제로 나눈 대화(사용자 질문 + 실제 AI 답변)가 전부 사라지고 고정된 데모 스크립트 3줄로
  // 되돌아갔다 — "챗봇이 같은 말을 계속 반복한다"는 증상의 진짜 원인. sessionStorage에서
  // 복원하되, 서버 렌더링 시점엔 sessionStorage에 접근할 수 없으므로 hydration 이후
  // (useEffect)에만 복원한다. 마운트 시 딱 1번만 시도한다 — AssistantChatWidget(자식)의 페이지
  // 진입 코칭 메시지 effect가 이 effect(부모)보다 먼저 실행돼 sessionStorage에 먼저 값을 쓸 수
  // 있어서, "저장된 값이 있으면 복원"을 매번 반복하면 그 코칭 메시지까지 그대로 복원해버려도
  // 괜찮다(중복 추가가 아니라 정확히 같은 내용이라 안전) — 대신 절대 두 번 이상 돌지 않게 한다.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          seenMessageCountRef.current = parsed.length; // 복원 직후 말풍선이 다시 뜨지 않게.
        }
      }
    } catch {
      // 저장된 값이 깨져있으면 조용히 기본 인사말로 시작한다.
    }
  }, []);

  // 로그인 세션이 확인되면 아직 대체 이름("러너")인 인사말만 실제 닉네임으로 바꿔치기한다 —
  // 정확히 그 문구일 때만 교체하므로 그 사이 다른 메시지(코칭 문구, 실제 대화)가 끼어들었어도
  // 손대지 않는다.
  useEffect(() => {
    const name = session?.user?.name;
    if (!name) return;
    setMessages((prev) => {
      if (prev.length === 0 || prev[0].from !== 'ai' || prev[0].text !== FALLBACK_GREETING.text) return prev;
      const next = [greetingMessage(name), ...prev.slice(1)];
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 저장 실패는 무시 — 화면 표시에는 영향 없다.
      }
      return next;
    });
  }, [session?.user?.name]);

  function addMessage(message: ChatMessage) {
    setMessages((prev) => {
      const next = [...prev, message].slice(-MAX_STORED_MESSAGES);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 저장 공간 초과 등은 무시 — 화면에는 계속 정상적으로 표시된다.
      }
      return next;
    });
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
