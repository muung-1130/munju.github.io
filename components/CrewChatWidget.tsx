'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useCrewChat } from './CrewChatContext';
import { CrewVsPanel } from './CrewVsPanel';

const ICON_SIZE = 56;
const BATTLE_POLL_MS = 7000;
const MIN_PANEL_WIDTH = 340;
const MAX_PANEL_WIDTH = 920;
const MIN_PANEL_HEIGHT = 420;
const MAX_PANEL_HEIGHT_MARGIN = 40;

type PendingBattle = {
  battleId: string;
  metricType: 'DISTANCE' | 'PACE';
  opponentCrewId: string;
  opponentCrewName: string;
  description: string;
  tally: { agree: number; disagree: number; total: number };
  myVote: 'AGREE' | 'DISAGREE' | null;
  isLeader: boolean;
  // awaitingOpponentResponse=true면 "우리 크루"가 상대의 제안에 응답할 차례다(24시간 제한).
  // expiresAtLabel은 서버가 KST로 미리 포맷해서 내려주는 값 그대로 표시한다.
  awaitingOpponentResponse: boolean;
  expiresAtLabel: string | null;
};

// 채팅 진입 버튼의 기본 가로 위치는 화면 우측 끝이 아니라 우측 2/3 지점으로 둔다.
function defaultIconPosition() {
  return { top: window.innerHeight - ICON_SIZE - 24, left: (window.innerWidth * 2) / 3 };
}

function clampIconPosition(pos: { top: number; left: number }) {
  return {
    top: Math.min(Math.max(pos.top, 8), window.innerHeight - ICON_SIZE - 8),
    left: Math.min(Math.max(pos.left, 8), window.innerWidth - ICON_SIZE - 8)
  };
}

function clampPanelPosition(pos: { top: number; left: number }, width: number, height: number) {
  return {
    top: Math.min(Math.max(pos.top, 8), window.innerHeight - height - 8),
    left: Math.min(Math.max(pos.left, 8), window.innerWidth - width - 8)
  };
}

// AI 러닝 비서 아이콘과 같은 방식(드래그 가능한 떠다니는 아이콘)으로 만든, 크루 채팅 전용 위젯.
// 크루 채팅방에 한 번 "참여하기"로 입장하면 다른 페이지로 이동해도 이 아이콘을 통해 계속 접근할 수 있다.
// 열린 패널 자체도 헤더를 드래그해 자유롭게 옮길 수 있고, "고정" 버튼으로 고정하지 않으면
// 바깥을 클릭했을 때 자동으로 최소화된다.
export function CrewChatWidget() {
  const { data: session } = useSession();
  const { crewId, crewName, open, pinned, messages, bubbleMessage, setOpen, setPinned, addMessage, dismissBubble, exitCrewChat } =
    useCrewChat();
  const [input, setInput] = useState('');
  const [bubbleReply, setBubbleReply] = useState('');
  const [iconPos, setIconPos] = useState<{ top: number; left: number } | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const iconDraggingRef = useRef(false);
  const panelDraggingRef = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const [panelSize, setPanelSize] = useState<{ width: number; height: number } | null>(null);
  const chatListRef = useRef<HTMLDivElement>(null);

  // 채팅창을 열 때와 새 메시지가 도착할 때 항상 맨 아래(최신 메시지)부터 보이게 한다.
  useEffect(() => {
    if (!open) return;
    const el = chatListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages]);

  // 패널 우하단 모서리를 오른쪽 화면 끝에 고정해둔 채, 왼쪽/아래로 끄는 만큼 너비·높이를 키운다.
  function handleResizeMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startWidth = panelRef.current?.offsetWidth ?? MIN_PANEL_WIDTH;
    const startHeight = panelRef.current?.offsetHeight ?? MIN_PANEL_HEIGHT;
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
  const [pendingBattle, setPendingBattle] = useState<PendingBattle | null>(null);
  const [battleActionBusy, setBattleActionBusy] = useState(false);
  const [myWeeklyStats, setMyWeeklyStats] = useState<{ avgWeeklyDistanceM: number | null; avgWeeklyPaceSecPerKm: number | null } | null>(
    null
  );
  const [myWeeklyStatsOpen, setMyWeeklyStatsOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (crewId && !iconPos) setIconPos(clampIconPosition(defaultIconPosition()));
  }, [crewId, iconPos]);

  // 크루장에게 제안된 배틀(동의 대기 중)이 있으면 채팅 패널 상단에 계속 떠 있어야 하므로 주기적으로 확인한다.
  useEffect(() => {
    if (!crewId) {
      setPendingBattle(null);
      return;
    }
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch(`/api/crew/${crewId}/battle/view`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setPendingBattle(data.pending ?? null);
      } catch {
        // 폴링 실패는 조용히 무시
      }
    }
    refresh();
    const timer = setInterval(refresh, BATTLE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [crewId]);

  useEffect(() => {
    setMyWeeklyStats(null);
    setMyWeeklyStatsOpen(false);
    if (!crewId) return;
    // 헤더에 항상 우리 크루 평균을 보여주므로(호버 전에도), 채팅방을 열자마자 미리 받아온다.
    fetch(`/api/crew/${crewId}/weekly-stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setMyWeeklyStats(data.stats))
      .catch(() => {});
  }, [crewId]);

  async function voteBattle(vote: 'AGREE' | 'DISAGREE') {
    if (!pendingBattle) return;
    setBattleActionBusy(true);
    try {
      const res = await fetch(`/api/crew/battle/${pendingBattle.battleId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote })
      });
      if (res.ok) {
        const data = await res.json();
        setPendingBattle((prev) => (prev ? { ...prev, myVote: vote, tally: data.tally } : prev));
      }
    } finally {
      setBattleActionBusy(false);
    }
  }

  async function decideBattle(approve: boolean) {
    if (!pendingBattle) return;
    setBattleActionBusy(true);
    try {
      const res = await fetch(`/api/crew/battle/${pendingBattle.battleId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve })
      });
      if (res.ok) setPendingBattle(null);
    } finally {
      setBattleActionBusy(false);
    }
  }

  async function confirmLeaveCrew() {
    if (!crewId) return;
    setLeaving(true);
    try {
      const res = await fetch(`/api/crew/${crewId}/leave`, { method: 'POST' });
      if (res.ok) {
        setLeaveConfirmOpen(false);
        exitCrewChat();
      }
    } finally {
      setLeaving(false);
    }
  }


  async function loadMyWeeklyStats() {
    if (!crewId) return;
    setMyWeeklyStatsOpen(true);
    if (myWeeklyStats) return;
    try {
      const res = await fetch(`/api/crew/${crewId}/weekly-stats`);
      if (res.ok) {
        const data = await res.json();
        setMyWeeklyStats(data.stats);
      }
    } catch {
      // 팝업 정보는 부가 정보라 실패해도 조용히 무시
    }
  }

  function formatWeeklyPace(secPerKm: number): string {
    const min = Math.floor(secPerKm / 60);
    const sec = Math.round(secPerKm % 60);
    return `${min}'${String(sec).padStart(2, '0')}"`;
  }

  // 고정(핀)돼 있지 않으면 패널 바깥을 클릭했을 때 자동으로 최소화한다.
  useEffect(() => {
    if (!open || pinned) return;
    function handleOutsideClick(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open, pinned, setOpen]);

  if (!crewId) return null;

  function handleIconMouseDown(event: React.MouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startPos = iconPos ?? defaultIconPosition();
    iconDraggingRef.current = false;

    function handleMouseMove(moveEvent: MouseEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) iconDraggingRef.current = true;
      setIconPos(clampIconPosition({ top: startPos.top + dy, left: startPos.left + dx }));
    }
    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleIconClick() {
    if (iconDraggingRef.current) {
      iconDraggingRef.current = false;
      return;
    }
    setOpen(true);
  }

  function handlePanelHeaderMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return; // 버튼 클릭은 드래그로 취급하지 않음
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startPos = { top: rect.top, left: rect.left };
    const rectWidth = rect.width;
    const rectHeight = rect.height;
    panelDraggingRef.current = false;

    function handleMouseMove(moveEvent: MouseEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) panelDraggingRef.current = true;
      setPanelPos(clampPanelPosition({ top: startPos.top + dy, left: startPos.left + dx }, rectWidth, rectHeight));
    }
    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  async function postMessage(text: string) {
    if (!text || !crewId) return;
    const res = await fetch(`/api/crew/${crewId}/chat/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    if (res.ok) addMessage(data.message);
  }

  async function sendChat() {
    const text = input.trim();
    setInput('');
    await postMessage(text);
  }

  async function sendBubbleReply() {
    const text = bubbleReply.trim();
    setBubbleReply('');
    await postMessage(text);
    dismissBubble();
    setOpen(true);
  }

  // 드래그로 옮긴 뒤에는 CSS의 translateX 슬라이드 계산(오른쪽 고정 위치 기준)이 더 이상 맞지
  // 않으므로, 위치와 무관하게 항상 자연스럽게 사라지는 scale(0)으로 열림/닫힘을 대신 표현한다.
  const panelStyle = {
    ...(panelPos
      ? {
          top: panelPos.top,
          left: panelPos.left,
          right: 'auto' as const,
          transform: open ? 'none' : 'scale(0)',
          transformOrigin: 'bottom right',
          pointerEvents: open ? ('auto' as const) : ('none' as const)
        }
      : {}),
    ...(panelSize ? { width: panelSize.width, height: panelSize.height } : {})
  };
  const finalPanelStyle = Object.keys(panelStyle).length > 0 ? panelStyle : undefined;

  return (
    <>
      {!open && iconPos && (
        <button
          className="home-chat-toggle crew-chat-toggle"
          style={{ top: iconPos.top, left: iconPos.left }}
          onMouseDown={handleIconMouseDown}
          onClick={handleIconClick}
          aria-label={`${crewName} 채팅방 열기 (드래그해서 위치를 옮길 수 있어요)`}
        >
          <img src="/assets/crew-chat-shield.svg" alt="" />
        </button>
      )}

      {!open && bubbleMessage && iconPos && (
        <div
          className="crew-chat-bubble"
          style={{ top: Math.max(8, iconPos.top - 190), left: Math.max(8, Math.min(iconPos.left - 200, window.innerWidth - 320)) }}
        >
          <div className="crew-chat-bubble-head">
            <strong>{crewName} · {bubbleMessage.senderName}</strong>
            <button onClick={dismissBubble} aria-label="닫기">✕</button>
          </div>
          <p>{bubbleMessage.message}</p>
          <form
            className="chat-input"
            onSubmit={(event) => {
              event.preventDefault();
              sendBubbleReply();
            }}
          >
            <input
              value={bubbleReply}
              onChange={(event) => setBubbleReply(event.target.value)}
              placeholder="바로 답장하기..."
              autoFocus
            />
            <button type="submit" aria-label="전송">➤</button>
          </form>
        </div>
      )}

      <aside
        ref={panelRef}
        className={`home-chat-panel crew-chat-panel ${open ? 'open' : ''} ${panelPos ? 'dragged' : ''}`}
        style={finalPanelStyle}
        aria-label="크루 채팅"
        aria-hidden={!open}
      >
        <div className="home-chat-resize-handle" onMouseDown={handleResizeMouseDown} aria-hidden="true" />
        <div className="home-chat-header" onMouseDown={handlePanelHeaderMouseDown} style={{ cursor: 'grab' }}>
          <span
            className="ai-avatar-small crew-chat-avatar"
            onMouseEnter={loadMyWeeklyStats}
            onMouseLeave={() => setMyWeeklyStatsOpen(false)}
            style={{ position: 'relative', cursor: 'default' }}
          >
            {crewName?.[0] ?? '크'}
            {myWeeklyStatsOpen && myWeeklyStats && (
              <div className="crew-battle-info-popup" style={{ left: 0, top: '110%' }}>
                <strong>{crewName}</strong>
                <span>
                  최근 7일 평균{' '}
                  {myWeeklyStats.avgWeeklyDistanceM !== null ? `${(myWeeklyStats.avgWeeklyDistanceM / 1000).toFixed(1)}km` : '기록 없음'}
                </span>
                <span>
                  평균 페이스{' '}
                  {myWeeklyStats.avgWeeklyPaceSecPerKm !== null ? `${formatWeeklyPace(myWeeklyStats.avgWeeklyPaceSecPerKm)}/km` : '기록 없음'}
                </span>
              </div>
            )}
          </span>
          <div>
            <strong>{crewName}</strong>
            <small>
              {myWeeklyStats && (myWeeklyStats.avgWeeklyDistanceM !== null || myWeeklyStats.avgWeeklyPaceSecPerKm !== null) ? (
                <>
                  최근 7일 평균{' '}
                  {myWeeklyStats.avgWeeklyDistanceM !== null && `${(myWeeklyStats.avgWeeklyDistanceM / 1000).toFixed(1)}km`}
                  {myWeeklyStats.avgWeeklyDistanceM !== null && myWeeklyStats.avgWeeklyPaceSecPerKm !== null && ' · '}
                  {myWeeklyStats.avgWeeklyPaceSecPerKm !== null && `${formatWeeklyPace(myWeeklyStats.avgWeeklyPaceSecPerKm)}/km`}
                </>
              ) : (
                '크루 채팅방 · 헤더를 드래그해서 옮길 수 있어요'
              )}
            </small>
          </div>
          <div className="crew-chat-header-actions">
            <button
              className={`crew-chat-pin ${pinned ? 'active' : ''}`}
              onClick={() => setPinned(!pinned)}
              aria-label={pinned ? '고정 해제' : '화면에 고정'}
              title={pinned ? '고정됨 (다시 눌러 해제)' : '고정하기 (다른 곳을 눌러도 안 닫혀요)'}
            >
              고정
            </button>
            <button className="crew-chat-leave" onClick={() => setLeaveConfirmOpen(true)}>
              나가기
            </button>
            <button className="home-chat-close" onClick={() => setOpen(false)} aria-label="채팅 최소화">✕</button>
          </div>
        </div>
        {pendingBattle && (
          <div className="crew-battle-banner">
            <div className="crew-battle-banner-head">
              <span className="type-pill">{pendingBattle.metricType === 'DISTANCE' ? 'km 배틀' : '페이스 배틀'}</span>
              {pendingBattle.awaitingOpponentResponse && <span className="type-pill incoming">받은 제안</span>}
              <span className="crew-battle-opponent-name">{pendingBattle.opponentCrewName}</span>
            </div>
            <p>{pendingBattle.description}</p>
            {pendingBattle.awaitingOpponentResponse && pendingBattle.expiresAtLabel && (
              <p className="crew-battle-deadline">{pendingBattle.expiresAtLabel}까지 응답이 없으면 자동으로 거절돼요.</p>
            )}
            {crewId && (
              <CrewVsPanel
                myCrewId={crewId}
                myCrewName={crewName ?? '우리 크루'}
                opponentCrewId={pendingBattle.opponentCrewId}
                opponentCrewName={pendingBattle.opponentCrewName}
                metricType={pendingBattle.metricType}
              />
            )}
            <div className="crew-battle-vote-bar">
              <i className="agree" style={{ width: `${(pendingBattle.tally.agree / pendingBattle.tally.total) * 100}%` }} />
              <i className="disagree" style={{ width: `${(pendingBattle.tally.disagree / pendingBattle.tally.total) * 100}%` }} />
            </div>
            <div className="crew-battle-vote-counts">
              <span>찬성 {pendingBattle.tally.agree}</span>
              <span>반대 {pendingBattle.tally.disagree}</span>
              <span>무응답 {pendingBattle.tally.total - pendingBattle.tally.agree - pendingBattle.tally.disagree}</span>
            </div>
            {pendingBattle.isLeader ? (
              <div className="crew-battle-actions">
                <button className="ghost-btn" disabled={battleActionBusy} onClick={() => decideBattle(false)}>거절</button>
                <button className="primary-btn" disabled={battleActionBusy} onClick={() => decideBattle(true)}>승인</button>
              </div>
            ) : pendingBattle.myVote ? (
              <p className="muted">내 투표: {pendingBattle.myVote === 'AGREE' ? '찬성 ✓' : '반대 ✓'}</p>
            ) : (
              <div className="crew-battle-actions">
                <button className="ghost-btn" disabled={battleActionBusy} onClick={() => voteBattle('DISAGREE')}>반대</button>
                <button className="primary-btn" disabled={battleActionBusy} onClick={() => voteBattle('AGREE')}>찬성</button>
              </div>
            )}
          </div>
        )}
        <div className="home-chat-list" ref={chatListRef}>
          {messages.map((message, index) => {
            // dateLabel은 서버가 이미 KST로 계산해서 내려준 값이라 여기서는 문자열 비교만 한다
            // (직접 타임존 변환을 하지 않는다) — 날짜가 바뀌는 지점에만 구분선을 넣는다.
            const showDateDivider = index === 0 || messages[index - 1].dateLabel !== message.dateLabel;
            return (
              <div key={index}>
                {showDateDivider && (
                  <div className="crew-chat-date-divider">
                    <span>{message.dateLabel}</span>
                  </div>
                )}
                <div className={`home-chat-line ${message.senderUserId === session?.user?.id ? 'user' : ''}`}>
                  {message.senderUserId !== session?.user?.id && <span className="avatar-dot">{message.senderName[0]}</span>}
                  <div className="home-chat-bubble-group">
                    {message.senderUserId !== session?.user?.id && (
                      <span className="crew-chat-sender-name">{message.senderName}</span>
                    )}
                    <p>{message.message}</p>
                  </div>
                  <span className="crew-chat-message-time">{message.timeLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
        <form
          className="chat-input"
          onSubmit={(event) => {
            event.preventDefault();
            sendChat();
          }}
        >
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="메시지를 입력하세요..." />
          <button type="submit" aria-label="전송">➤</button>
        </form>
      </aside>

      {leaveConfirmOpen && (
        <div className="crew-chat-overlay" style={{ zIndex: 1500 }} onClick={() => setLeaveConfirmOpen(false)}>
          <div className="crew-detail-modal" style={{ width: 360 }} onClick={(event) => event.stopPropagation()}>
            <div className="crew-chat-modal-head">
              <strong>크루 탈퇴</strong>
              <button onClick={() => setLeaveConfirmOpen(false)} aria-label="닫기">✕</button>
            </div>
            <p>크루를 탈퇴하시겠습니까?</p>
            <div className="crew-battle-actions">
              <button className="ghost-btn" disabled={leaving} onClick={() => setLeaveConfirmOpen(false)}>
                취소
              </button>
              <button className="primary-btn" disabled={leaving} onClick={confirmLeaveCrew}>
                {leaving ? '탈퇴 중...' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
