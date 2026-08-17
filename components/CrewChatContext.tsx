'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';

// dateLabel/timeLabel은 서버가 KST로 변환해서 내려주는 값이다 — 프론트는 그대로 표시만 한다.
export type CrewChatMessage = { senderUserId: string; senderName: string; message: string; createdAt: string; dateLabel: string; timeLabel: string };

const MESSAGE_POLL_MS = 5000;

type CrewChatContextValue = {
  crewId: string | null;
  crewName: string | null;
  open: boolean;
  pinned: boolean;
  messages: CrewChatMessage[];
  bubbleMessage: CrewChatMessage | null;
  setOpen: (open: boolean) => void;
  setPinned: (pinned: boolean) => void;
  openCrewChat: (crewId: string, crewName: string, messages: CrewChatMessage[]) => void;
  addMessage: (message: CrewChatMessage) => void;
  dismissBubble: () => void;
  exitCrewChat: () => void;
};

const CrewChatContext = createContext<CrewChatContextValue | null>(null);

// AI 러닝 비서 위젯과 같은 패턴: 채팅방에 한 번 입장하면(참여하기) 페이지를 이동해도 떠다니는
// 아이콘으로 계속 접근할 수 있게 상태를 전역으로 끌어올린다.
export function CrewChatProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [crewId, setCrewId] = useState<string | null>(null);
  const [crewName, setCrewName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [messages, setMessages] = useState<CrewChatMessage[]>([]);
  const [bubbleMessage, setBubbleMessage] = useState<CrewChatMessage | null>(null);
  const seenMessageCountRef = useRef(0);
  const sessionUserId = session?.user?.id;
  const loadedForUserIdRef = useRef<string | null>(null);

  function openCrewChat(newCrewId: string, newCrewName: string, initialMessages: CrewChatMessage[]) {
    setCrewId(newCrewId);
    setCrewName(newCrewName);
    setMessages(initialMessages);
    seenMessageCountRef.current = initialMessages.length;
    setBubbleMessage(null);
    setOpen(true);
  }

  function addMessage(message: CrewChatMessage) {
    setMessages((prev) => [...prev, message]);
  }

  function dismissBubble() {
    setBubbleMessage(null);
  }

  function exitCrewChat() {
    setCrewId(null);
    setCrewName(null);
    setMessages([]);
    setBubbleMessage(null);
    seenMessageCountRef.current = 0;
    setOpen(false);
    setPinned(false);
  }

  // 다른 사람이 보낸 새 메시지가 들어오면(패널이 닫혀 있을 때) 우측 하단에 미리보기 말풍선을 띄운다.
  useEffect(() => {
    if (messages.length <= seenMessageCountRef.current) return;
    const newest = messages[messages.length - 1];
    seenMessageCountRef.current = messages.length;
    if (newest.senderUserId !== session?.user?.id && !open) {
      setBubbleMessage(newest);
    }
  }, [messages, open, session?.user?.id]);

  // 로그아웃하거나(또는 다른 계정으로 로그인해서) 세션 사용자가 바뀌면 이전 사용자의 크루 채팅
  // 상태를 지운다 — 그러지 않으면 로그아웃한 뒤에도 이전 사용자의 채팅 아이콘이 그대로 남는다.
  useEffect(() => {
    if (loadedForUserIdRef.current && loadedForUserIdRef.current !== (sessionUserId ?? null)) {
      loadedForUserIdRef.current = null;
      exitCrewChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId]);

  // 로그인 직후(또는 로그아웃 후 재로그인) 이 사용자가 이미 입장해본 크루 채팅방이 있으면
  // 자동으로 복원한다 — 채팅 아이콘이 세션에만 남지 않고, 로그아웃했다가 다시 로그인해도
  // 항상 같은 자리(우측 하단 기본 위치)에 다시 뜨게 하기 위함이다.
  useEffect(() => {
    if (!sessionUserId || crewId || loadedForUserIdRef.current === sessionUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/crew/my-chat');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        loadedForUserIdRef.current = sessionUserId;
        if (data.crewId) {
          setCrewId(data.crewId);
          setCrewName(data.crewName);
          setMessages(data.messages ?? []);
          seenMessageCountRef.current = (data.messages ?? []).length;
          setOpen(false);
        }
      } catch {
        // 실패해도 조용히 무시 — 다음에 crewId가 여전히 비어있으면 다시 시도된다.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUserId, crewId]);

  // 열려 있는 채팅방에 새 메시지가 왔는지 주기적으로 확인한다(실시간 소켓이 없어 폴링으로 대체).
  useEffect(() => {
    if (!crewId) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/crew/${crewId}/chat/messages`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.messages) && data.messages.length > seenMessageCountRef.current) {
          setMessages(data.messages);
        }
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 주기에 다시 시도한다.
      }
    }, MESSAGE_POLL_MS);
    return () => clearInterval(timer);
  }, [crewId]);

  return (
    <CrewChatContext.Provider
      value={{ crewId, crewName, open, pinned, messages, bubbleMessage, setOpen, setPinned, openCrewChat, addMessage, dismissBubble, exitCrewChat }}
    >
      {children}
    </CrewChatContext.Provider>
  );
}

export function useCrewChat() {
  const ctx = useContext(CrewChatContext);
  if (!ctx) throw new Error('useCrewChat은 CrewChatProvider 안에서만 사용할 수 있어요.');
  return ctx;
}
