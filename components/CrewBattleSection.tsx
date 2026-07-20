'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/UI';

const VIEW_POLL_MS = 10000;

type BattleCandidate = {
  crewId: string;
  crewName: string;
  memberCount: number;
  statValue: number;
  tier: number;
};

type PendingBattle = {
  opponentCrewName: string;
  metricType: 'DISTANCE' | 'PACE';
};

type BattleDay = { date: string; crewAValue: number | null; crewBValue: number | null; crewAWon: boolean | null; isToday: boolean };

type ActiveBattle = {
  battleId: string;
  metricType: 'DISTANCE' | 'PACE';
  myCrewName: string;
  opponentCrewId: string;
  opponentCrewName: string;
  days: BattleDay[];
  myWins: number;
  opponentWins: number;
  showFinalBanner: boolean;
  finalResult: 'WIN' | 'LOSE' | null;
  isLeader: boolean;
};

type CrewBattleInfo = {
  crewName: string;
  memberCount: number;
  rank: number | null;
  rankTotal: number;
  statValue: number | null;
  winCount: number;
};

type ViewResponse = {
  pending: PendingBattle | null;
  active: ActiveBattle | null;
  recommendations: { distance: BattleCandidate[]; pace: BattleCandidate[] } | null;
};

function formatStat(metricType: 'DISTANCE' | 'PACE', value: number | null): string {
  if (value === null) return '기록 없음';
  return metricType === 'DISTANCE' ? `${value.toFixed(2)}km` : `${value.toFixed(2)}분/km`;
}

function CrewNamePopup({ crewId, crewName, metricType }: { crewId: string; crewName: string; metricType: 'DISTANCE' | 'PACE' }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<CrewBattleInfo | null>(null);

  async function load() {
    setOpen(true);
    if (info) return;
    const res = await fetch(`/api/crew/${crewId}/battle/info?metric=${metricType}`);
    if (res.ok) setInfo((await res.json()).info);
  }

  return (
    <span className="crew-battle-opponent-name" style={{ position: 'relative' }} onMouseEnter={load} onMouseLeave={() => setOpen(false)} onClick={load}>
      {crewName}
      {open && info && (
        <span className="crew-battle-info-popup" style={{ display: 'flex' }}>
          <strong>{info.crewName}</strong>
          <span>랭킹 {info.rank ? `${info.rank}/${info.rankTotal}위` : '집계 전'}</span>
          <span>인원 {info.memberCount}명</span>
          <span>배틀 우승 {info.winCount}회</span>
        </span>
      )}
    </span>
  );
}

function RecommendationCard({
  metricType,
  candidates,
  crewId,
  onProposed
}: {
  metricType: 'DISTANCE' | 'PACE';
  candidates: BattleCandidate[];
  crewId: string;
  onProposed: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [proposing, setProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidate = candidates[index] ?? null;

  async function propose() {
    if (!candidate) return;
    setProposing(true);
    setError(null);
    try {
      const res = await fetch(`/api/crew/${crewId}/battle/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opponentCrewId: candidate.crewId, metricType })
      });
      if (res.ok) onProposed();
      else {
        const data = await res.json();
        setError(data.error ?? '제안할 수 없어요.');
      }
    } finally {
      setProposing(false);
    }
  }

  return (
    <Card>
      <div className="card-head">
        <h2>{metricType === 'DISTANCE' ? 'km 배틀 상대 추천' : '페이스 배틀 상대 추천'}</h2>
        <span className="type-pill">{metricType === 'DISTANCE' ? 'km 배틀' : '페이스 배틀'}</span>
      </div>
      {!candidate ? (
        <p className="muted" style={{ marginTop: 14 }}>
          다른 크루들이 모두 배틀 중이라 배틀할 상대가 없어요. 조금만 기다려주세요!
        </p>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div className="crew-battle-banner-head">
            <strong>{candidate.crewName}</strong>
          </div>
          <p className="muted" style={{ margin: '8px 0' }}>
            최근 7일 크루원 평균 {formatStat(metricType, candidate.statValue)} · {candidate.memberCount}명
          </p>
          {error && <p className="field-error">{error}</p>}
          <div className="crew-battle-actions">
            <button className="ghost-btn" onClick={() => setIndex((i) => (i + 1) % candidates.length)}>
              새로운 상대 보기
            </button>
            <button className="primary-btn" disabled={proposing} onClick={propose}>
              {proposing ? '제안 중...' : '제안하기'}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ActiveBattleTable({ battle, crewId, onLeft }: { battle: ActiveBattle; crewId: string; onLeft: () => void }) {
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    setLeaving(true);
    try {
      const res = await fetch(`/api/crew/${crewId}/battle/leave`, { method: 'POST' });
      if (res.ok) onLeft();
    } finally {
      setLeaving(false);
    }
  }

  return (
    <Card className="crew-battle-card">
      <div className="card-head">
        <h2>크루 배틀 현황</h2>
        <span className="type-pill">{battle.metricType === 'DISTANCE' ? 'km 배틀' : '페이스 배틀'}</span>
      </div>

      {battle.showFinalBanner && (
        <div className={`crew-battle-final-banner ${battle.finalResult === 'WIN' ? 'win' : 'lose'}`}>
          {battle.finalResult === 'WIN' ? '승리했습니다!!!' : '더 성장해서 다음 기회에 이겨봅시다!'}
        </div>
      )}

      <div className="crew-battle-table-wrap">
        <table className="crew-battle-table">
          <thead>
            <tr>
              <th />
              {battle.days.map((day) => (
                <th key={day.date}>{day.date.slice(5).replace('-', '/')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{battle.myCrewName} (우리 크루)</td>
              {battle.days.map((day) => (
                <td key={day.date} className={day.crewAWon === true ? 'win-cell' : ''}>
                  {day.crewAValue === null ? '-' : battle.metricType === 'DISTANCE' ? `${day.crewAValue.toFixed(2)}km` : `${day.crewAValue.toFixed(2)}'`}
                </td>
              ))}
            </tr>
            <tr>
              <td>
                <CrewNamePopup crewId={battle.opponentCrewId} crewName={battle.opponentCrewName} metricType={battle.metricType} />
              </td>
              {battle.days.map((day) => (
                <td key={day.date} className={day.crewAWon === false ? 'win-cell' : ''}>
                  {day.crewBValue === null ? '-' : battle.metricType === 'DISTANCE' ? `${day.crewBValue.toFixed(2)}km` : `${day.crewBValue.toFixed(2)}'`}
                </td>
              ))}
            </tr>
            <tr className="result-row">
              <td>결과</td>
              {battle.days.map((day) => (
                <td key={day.date}>{day.isToday ? '진행중' : day.crewAWon ? '성공' : '실패'}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: '10px 0' }}>
        {battle.myWins}승 {battle.opponentWins}패
      </p>
      {battle.isLeader && (
        <button className="ghost-btn full-width" disabled={leaving} onClick={leave}>
          {leaving ? '처리 중...' : '배틀 나가기'}
        </button>
      )}
    </Card>
  );
}

export function CrewBattleSection({ crewId }: { crewId: string }) {
  const [view, setView] = useState<ViewResponse | null>(null);

  function load() {
    fetch(`/api/crew/${crewId}/battle/view`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setView(data));
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, VIEW_POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewId]);

  if (!view) return null;

  if (view.active) {
    return <ActiveBattleTable battle={view.active} crewId={crewId} onLeft={load} />;
  }

  if (view.pending) {
    return (
      <Card>
        <div className="card-head">
          <h2>크루 배틀</h2>
          <span className="type-pill">{view.pending.metricType === 'DISTANCE' ? 'km 배틀' : '페이스 배틀'}</span>
        </div>
        <p className="muted" style={{ marginTop: 14 }}>
          {view.pending.opponentCrewName} 크루와의 배틀 제안이 크루 채팅방에서 검토 중이에요. 채팅방에서 찬성/반대를 눌러주세요!
        </p>
      </Card>
    );
  }

  if (view.recommendations) {
    return (
      <div className="crew-battle-reco-grid">
        <RecommendationCard metricType="DISTANCE" candidates={view.recommendations.distance} crewId={crewId} onProposed={load} />
        <RecommendationCard metricType="PACE" candidates={view.recommendations.pace} crewId={crewId} onProposed={load} />
      </div>
    );
  }

  return null;
}
