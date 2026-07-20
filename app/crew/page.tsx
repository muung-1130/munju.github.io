'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, PageTitle } from '@/components/UI';
import { useAuthModal } from '@/components/AuthModalContext';
import { useCrewChat } from '@/components/CrewChatContext';
import { CreateCrewModal } from '@/components/CreateCrewModal';
import { CrewBattleSection } from '@/components/CrewBattleSection';

type Crew = {
  crewId: string;
  crewName: string;
  description: string | null;
  regionCode: string | null;
  meetingLocation: string | null;
  targetDistanceMinM: number | null;
  targetDistanceMaxM: number | null;
  paceMinSecPerKm: number | null;
  paceMaxSecPerKm: number | null;
  minimumWeeklyFrequency: number | null;
  joinType: string;
  maxMembers: number;
  status: string;
  memberCount: number;
  ownerNickname: string | null;
  createdAt: string;
  fitsMyConditions: boolean;
  avgWeeklyDistanceM: number | null;
  avgWeeklyPaceSecPerKm: number | null;
  statsUpdatedAt: string | null;
};

function formatWeeklyPace(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}'${String(sec).padStart(2, '0')}"`;
}

function WeeklyStatsBadge({ crew }: { crew: Pick<Crew, 'avgWeeklyDistanceM' | 'avgWeeklyPaceSecPerKm'> }) {
  if (crew.avgWeeklyDistanceM === null && crew.avgWeeklyPaceSecPerKm === null) return null;
  return (
    <span className="crew-weekly-stats-badge" title="최근 7일 크루원 평균 기록">
      {crew.avgWeeklyDistanceM !== null && <>🏃 주간 평균 {(crew.avgWeeklyDistanceM / 1000).toFixed(1)}km</>}
      {crew.avgWeeklyDistanceM !== null && crew.avgWeeklyPaceSecPerKm !== null && ' · '}
      {crew.avgWeeklyPaceSecPerKm !== null && <>⚡ 평균 페이스 {formatWeeklyPace(crew.avgWeeklyPaceSecPerKm)}/km</>}
    </span>
  );
}

const JOIN_TYPE_LABEL: Record<string, string> = { PUBLIC: '자유가입', PRIVATE: '승인제' };
const STATUS_LABEL: Record<string, string> = { RECRUITING: '모집중', FULL: '정원마감', CLOSED: '마감' };

function formatPaceLabel(sec: number) {
  const m = Math.floor(sec / 60);
  const s = String(Math.round(sec % 60)).padStart(2, '0');
  return `${m}'${s}"`;
}

function distanceRangeLabel(minM: number | null, maxM: number | null) {
  if (minM && maxM) return `${(minM / 1000).toFixed(1)}~${(maxM / 1000).toFixed(1)}km`;
  if (minM) return `${(minM / 1000).toFixed(1)}km 이상`;
  if (maxM) return `${(maxM / 1000).toFixed(1)}km 이하`;
  return '제한 없음';
}

function paceRangeLabel(minSec: number | null, maxSec: number | null) {
  if (minSec && maxSec) return `${formatPaceLabel(maxSec)}~${formatPaceLabel(minSec)}/km`;
  if (minSec) return `${formatPaceLabel(minSec)}/km 이상`;
  if (maxSec) return `${formatPaceLabel(maxSec)}/km 이하`;
  return '제한 없음';
}


export default function CrewPage() {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();
  const { openCrewChat } = useCrewChat();
  const [crews, setCrews] = useState<Crew[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [detailCrewId, setDetailCrewId] = useState<string | null>(null);
  const [participateLoading, setParticipateLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [joinRequestCrew, setJoinRequestCrew] = useState<Crew | null>(null);
  const [joinRequestMessage, setJoinRequestMessage] = useState('');
  const [joinRequestSent, setJoinRequestSent] = useState(false);
  const [joinRequestSubmitting, setJoinRequestSubmitting] = useState(false);
  const [joinRequestError, setJoinRequestError] = useState<string | null>(null);
  const [participateError, setParticipateError] = useState<string | null>(null);
  const [myCrew, setMyCrew] = useState<{ crewId: string } | null | undefined>(undefined);

  function loadCrews() {
    fetch('/api/crew')
      .then((res) => (res.ok ? res.json() : { crews: [] }))
      .then((json) => setCrews(json.crews ?? []));
  }

  useEffect(() => {
    loadCrews();
  }, []);

  // 이미 어떤 크루엔가 가입돼 있으면(=크루 배틀에 참여할 수 있으면) 크루 모집 영역보다
  // 위에 배틀 추천/현황 패널을 먼저 보여준다.
  useEffect(() => {
    if (!session?.user) {
      setMyCrew(null);
      return;
    }
    fetch('/api/crew/battle/my-crew')
      .then((res) => (res.ok ? res.json() : { crewId: null }))
      .then((data) => setMyCrew(data.crewId ? { crewId: data.crewId } : null));
  }, [session?.user?.id]);

  const visibleCrews = crews ? (showAll ? crews : crews.filter((crew) => crew.fitsMyConditions)) : [];
  const detailCrew = crews?.find((crew) => crew.crewId === detailCrewId) ?? null;
  const myCrewData = crews?.find((crew) => crew.crewId === myCrew?.crewId) ?? null;
  // 이미 /api/crew 목록 조회에서 모든 크루의 avg_weekly_distance_m을 함께 받아오므로
  // 별도 쿼리 없이 메모리에서 정렬만 하면 된다 (성능 저하 없음).
  const overallRanking = (crews ?? [])
    .filter((crew) => crew.avgWeeklyDistanceM !== null)
    .sort((a, b) => (b.avgWeeklyDistanceM as number) - (a.avgWeeklyDistanceM as number))
    .slice(0, 10);

  async function enterMyCrewChat() {
    if (!myCrewData) return;
    setParticipateLoading(true);
    try {
      const res = await fetch(`/api/crew/${myCrewData.crewId}/chat/join`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) openCrewChat(myCrewData.crewId, myCrewData.crewName, data.messages ?? []);
    } finally {
      setParticipateLoading(false);
    }
  }

  async function handleParticipate(crew: Crew) {
    if (!session?.user) {
      openAuthModal();
      return;
    }
    if (crew.joinType === 'PRIVATE') {
      setDetailCrewId(null);
      setJoinRequestCrew(crew);
      setJoinRequestMessage('');
      setJoinRequestSent(false);
      setJoinRequestError(null);
      return;
    }
    setParticipateError(null);
    setParticipateLoading(true);
    try {
      const res = await fetch(`/api/crew/${crew.crewId}/chat/join`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setDetailCrewId(null);
        openCrewChat(crew.crewId, crew.crewName, data.messages ?? []);
        loadCrews();
      } else {
        setParticipateError(data.error ?? '입장할 수 없어요.');
      }
    } finally {
      setParticipateLoading(false);
    }
  }

  async function submitJoinRequest() {
    if (!joinRequestCrew) return;
    setJoinRequestError(null);
    setJoinRequestSubmitting(true);
    try {
      const res = await fetch(`/api/crew/${joinRequestCrew.crewId}/join-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: joinRequestMessage })
      });
      const data = await res.json();
      if (res.ok) setJoinRequestSent(true);
      else setJoinRequestError(data.error ?? '신청할 수 없어요.');
    } finally {
      setJoinRequestSubmitting(false);
    }
  }

  return (
    <div>
      <PageTitle
        title="러닝크루"
        subtitle="내 지역, 내 페이스에 맞는 크루를 찾아 채팅방에 바로 입장하세요."
        action={
          <button
            type="button"
            className="primary-btn"
            onClick={() => (session?.user ? setCreateOpen(true) : openAuthModal())}
          >
            + 러닝크루 만들기
          </button>
        }
      />
      {myCrewData && (
        <Card className="my-crew-card">
          <div className="card-head"><h2>내 크루</h2></div>
          <div className="my-crew-body">
            <div className="my-crew-info">
              <strong>{myCrewData.crewName}</strong>
              <div className="crew-info-row">
                <span>📍 {myCrewData.regionCode ?? '지역 무관'}</span>
                <span>👥 {myCrewData.memberCount}/{myCrewData.maxMembers}명</span>
              </div>
              <WeeklyStatsBadge crew={myCrewData} />
            </div>
            <button className="primary-btn" onClick={enterMyCrewChat} disabled={participateLoading}>
              {participateLoading ? '입장 중...' : '채팅방 들어가기 →'}
            </button>
          </div>
        </Card>
      )}
      {myCrew && (
        <div className="crew-battle-top">
          <CrewBattleSection crewId={myCrew.crewId} />
        </div>
      )}
      <div className="crew-page-grid">
        <section className="crew-list-col">
          <div className="crew-list-head">
            <div>
              <h2>크루 모집 <span className="muted">{visibleCrews.length}개</span></h2>
              <p className="muted">기본적으로 내 조건에 맞는 크루만 보여드려요.</p>
            </div>
            <label className="crew-filter-toggle">
              <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
              <span>전체보기</span>
            </label>
          </div>

          {crews === null ? (
            <Card className="crew-empty">크루 목록을 불러오는 중...</Card>
          ) : (
            visibleCrews.map((crew) => {
              const outOfMyCondition = showAll && !crew.fitsMyConditions;
              return (
                <Card key={crew.crewId} className="crew-entry">
                  <div className="crew-entry-top">
                    <button
                      className="crew-entry-title"
                      onClick={() => {
                        setDetailCrewId(crew.crewId);
                        setParticipateError(null);
                      }}
                    >
                      {crew.crewName}
                    </button>
                    {outOfMyCondition && <span className="type-pill">조건 외</span>}
                  </div>
                  <div className="crew-info-row">
                    <span>📍 {crew.regionCode ?? '지역 무관'}</span>
                    <span>🎯 {distanceRangeLabel(crew.targetDistanceMinM, crew.targetDistanceMaxM)}</span>
                    <span>⚡ {paceRangeLabel(crew.paceMinSecPerKm, crew.paceMaxSecPerKm)}</span>
                    <span>🗓 주 {crew.minimumWeeklyFrequency ?? '-'}회↑</span>
                    <span>👥 {crew.memberCount}/{crew.maxMembers}명</span>
                  </div>
                  <WeeklyStatsBadge crew={crew} />
                </Card>
              );
            })
          )}

          {crews !== null && visibleCrews.length === 0 && (
            <Card className="crew-empty">조건에 맞는 크루가 없어요. 우측 상단 전체보기를 켜보세요.</Card>
          )}
        </section>

        <aside className="crew-side-col">
          <Card className="crew-ranking-card">
            <div className="card-head"><h2>전체 크루 랭킹</h2><span className="muted">TOP 10</span></div>
            <div className="crew-ranking-list">
              {overallRanking.length === 0 && <p className="muted">아직 집계된 크루 기록이 없어요.</p>}
              {overallRanking.map((crew, index) => {
                const rank = index + 1;
                return (
                  <div key={crew.crewId} className={`crew-rank-row ${rank <= 3 ? `top top${rank}` : ''}`}>
                    <span>{rank}</span>
                    <b>{crew.crewName}</b>
                    <em>{((crew.avgWeeklyDistanceM as number) / 1000).toFixed(1)} km</em>
                  </div>
                );
              })}
            </div>
          </Card>

        </aside>
      </div>

      {detailCrew && (
        <div className="crew-chat-overlay" onClick={() => setDetailCrewId(null)}>
          <div className="crew-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="crew-chat-modal-head">
              <strong>{detailCrew.crewName}</strong>
              <button onClick={() => setDetailCrewId(null)} aria-label="닫기">✕</button>
            </div>
            <div className="crew-info-row">
              <span>📍 {detailCrew.regionCode ?? '지역 무관'}</span>
              <span>🎯 {distanceRangeLabel(detailCrew.targetDistanceMinM, detailCrew.targetDistanceMaxM)}</span>
              <span>⚡ {paceRangeLabel(detailCrew.paceMinSecPerKm, detailCrew.paceMaxSecPerKm)}</span>
              <span>🗓 주 {detailCrew.minimumWeeklyFrequency ?? '-'}회↑</span>
              <span>👥 {detailCrew.memberCount}/{detailCrew.maxMembers}명</span>
            </div>
            <div className="crew-detail">
              {detailCrew.description && <p className="crew-detail-intro">“{detailCrew.description}”</p>}
              <div className="crew-detail-stats">
                <div><span>모임 장소</span><strong>{detailCrew.meetingLocation ?? '무관'}</strong></div>
                {detailCrew.avgWeeklyDistanceM !== null && (
                  <div><span>최근 7일 평균 거리</span><strong>{(detailCrew.avgWeeklyDistanceM / 1000).toFixed(1)}km</strong></div>
                )}
                {detailCrew.avgWeeklyPaceSecPerKm !== null && (
                  <div><span>최근 7일 평균 페이스</span><strong>{formatWeeklyPace(detailCrew.avgWeeklyPaceSecPerKm)}/km</strong></div>
                )}
                <div><span>가입 방식</span><strong>{JOIN_TYPE_LABEL[detailCrew.joinType] ?? detailCrew.joinType}</strong></div>
                <div><span>모집 상태</span><strong>{STATUS_LABEL[detailCrew.status] ?? detailCrew.status}</strong></div>
                <div><span>크루장</span><strong>{detailCrew.ownerNickname ?? '알 수 없음'}</strong></div>
                <div>
                  <span>개설일</span>
                  <strong>{new Date(detailCrew.createdAt).toLocaleDateString('ko-KR')}</strong>
                </div>
                <div><span>내 조건 매칭</span><strong>{detailCrew.fitsMyConditions ? '맞음 ✅' : '안 맞음'}</strong></div>
              </div>
            </div>
            {participateError && <p className="field-error">{participateError}</p>}
            <button className="primary-btn full-width" onClick={() => handleParticipate(detailCrew)} disabled={participateLoading}>
              {participateLoading
                ? '처리 중...'
                : detailCrew.joinType === 'PRIVATE'
                  ? '가입 신청하기 →'
                  : '채팅방 입장하기 →'}
            </button>
          </div>
        </div>
      )}

      {joinRequestCrew && (
        <div className="crew-chat-overlay" onClick={() => setJoinRequestCrew(null)}>
          <div className="crew-detail-modal" style={{ width: 420 }} onClick={(event) => event.stopPropagation()}>
            <div className="crew-chat-modal-head">
              <strong>{joinRequestCrew.crewName} 가입 신청</strong>
              <button onClick={() => setJoinRequestCrew(null)} aria-label="닫기">✕</button>
            </div>
            {joinRequestSent ? (
              <p className="field-ok">크루 신청이 보내졌어요! 크루 가입 여부는 확인 후 알려드릴게요 🙌</p>
            ) : (
              <>
                <textarea
                  className="review-textarea"
                  placeholder="간단한 가입 인사를 남겨주세요 (선택)"
                  value={joinRequestMessage}
                  onChange={(event) => setJoinRequestMessage(event.target.value)}
                />
                {joinRequestError && <p className="field-error">{joinRequestError}</p>}
                <button className="primary-btn full-width" onClick={submitJoinRequest} disabled={joinRequestSubmitting}>
                  {joinRequestSubmitting ? '전송 중...' : '전송'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <CreateCrewModal
          onClose={() => setCreateOpen(false)}
          onCreated={async (crew) => {
            setCreateOpen(false);
            loadCrews();
            // 크루를 만들면 만든 사람은 이미 LEADER로 자동 가입된 상태이므로, "채팅방 입장하기"를
            // 한 번 더 누르게 하지 않고 곧바로 채팅방을 만들어서 띄운다.
            const res = await fetch(`/api/crew/${crew.crewId}/chat/join`, { method: 'POST' });
            if (res.ok) {
              const data = await res.json();
              openCrewChat(crew.crewId, crew.crewName, data.messages ?? []);
            }
          }}
        />
      )}
    </div>
  );
}
