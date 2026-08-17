'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';

export type ChatMessage = { from: 'ai' | 'user'; text: string };

function greetingMessage(name: string): ChatMessage {
  return { from: 'ai', text: `안녕하세요, ${name}님! 저는 ${name}님의 러닝 비서에요! 무엇이든 물어봐주세요!` };
}

const BUBBLE_VISIBLE_MS = 5000;
const STORAGE_KEY = 'aiAssistantMessages';
// 이 탭에서 현재 대화가 "누구 것"인지 표시해둔다. 로그인 사용자가 바뀌면(로그아웃 포함) 이전
// 대화가 남아있지 않도록 초기화하는 기준이 된다 — 새로고침(같은 사용자 유지)과는 구분해야 한다.
const SESSION_USER_KEY = 'aiAssistantSessionUserId';
const MAX_STORED_MESSAGES = 50;

type ChatContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openChat: () => void;
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  bubbleMessage: string | null;
  showEphemeralBubble: (text: string) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

const FALLBACK_GREETING = greetingMessage('러너');

export function ChatProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const [open, setOpen] = useState(false);
  // 서버/클라이언트 첫 렌더가 항상 같은 값이어야 hydration mismatch가 안 나므로, sessionStorage나
  // session을 들여다보지 않는 고정 인사말로 시작한다(닉네임은 아래 effect에서 알게 되는 대로 바꿔치기).
  const [messages, setMessages] = useState<ChatMessage[]>([FALLBACK_GREETING]);
  const [bubbleMessage, setBubbleMessage] = useState<string | null>(null);
  const seenMessageCountRef = useRef(1);
  const restoredRef = useRef(false);

  // 로그인 사용자가 바뀔 때(로그인/로그아웃/다른 계정으로 재로그인)만 대화를 인사말 한 줄로
  // 초기화한다. 같은 사용자로 남아있는 새로고침/재진입은 sessionStorage에서 대화를 그대로 복원한다
  // (그렇지 않으면 실제로 나눈 대화가 매 새로고침마다 사라지는 문제가 재발한다).
  //
  // 예전에는 "마운트 시 한 번만 복원"만 했는데, 그 복원 로직이 로그인 여부와 무관하게 항상
  // sessionStorage에 남아있던 이전 대화(완주 축하 메시지, 예전 질문/답변 등)를 그대로 되살려서
  // "로그인할 때마다 예전 답변이 다시 뜬다"는 증상이 있었다 — 로그인 사용자 변경을 감지해서
  // 그 경우에만 확실히 초기화하도록 분리했다.
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    const currentUserId = session?.user?.id ?? null;
    const storedUserId = sessionStorage.getItem(SESSION_USER_KEY);

    if (currentUserId !== storedUserId) {
      const greeting = currentUserId && session?.user?.name ? greetingMessage(session.user.name) : FALLBACK_GREETING;
      setMessages([greeting]);
      seenMessageCountRef.current = 1;
      restoredRef.current = true; // 같은 렌더 사이클에서 아래 복원 effect가 다시 덮어쓰지 않게.
      try {
        if (currentUserId) sessionStorage.setItem(SESSION_USER_KEY, currentUserId);
        else sessionStorage.removeItem(SESSION_USER_KEY);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify([greeting]));
      } catch {
        // 저장 실패는 무시 — 화면 표시에는 영향 없다.
      }
      return;
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, sessionStatus]);

  function addMessage(message: ChatMessage) {
    setMessages((prev) => {
      // 원인은 못 찾았지만 실제로 같은 응답이 연달아 두 번 붙는 증상이 있어서, 바로 직전
      // 메시지와 from/text가 완전히 같으면 추가하지 않는다 — 방어적 처리.
      const last = prev[prev.length - 1];
      if (last && last.from === message.from && last.text === message.text) {
        return prev;
      }
      const next = [...prev, message].slice(-MAX_STORED_MESSAGES);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 저장 공간 초과 등은 무시 — 화면에는 계속 정상적으로 표시된다.
      }
      return next;
    });
  }

  // 특정 페이지 진입 시 건네는 말처럼 "그 순간에만 잠깐 보여주면 되는" 안내는 대화 목록에
  // 남기지 않는다 — 대화창을 열어보면 실제로 주고받은 적 없는 말이 기록처럼 남아있는 게 어색하다.
  function showEphemeralBubble(text: string) {
    if (!open) setBubbleMessage(text);
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
    <ChatContext.Provider value={{ open, setOpen, openChat, messages, addMessage, bubbleMessage, showEphemeralBubble }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat은 ChatProvider 안에서만 사용할 수 있어요.');
  return ctx;
}
