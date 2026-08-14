'use client';

import { useState } from 'react';
import { Card } from '@/components/UI';

type BattleHistoryEntry = {
  battleId: string;
  metricType: 'DISTANCE' | 'PACE';
  opponentCrewName: string;
  status: 'COMPLETED' | 'DECLINED' | 'CANCELLED';
  result: 'WIN' | 'LOSE' | 'DRAW' | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
};

const RESULT_LABEL: Record<string, string> = { WIN: '승', LOSE: '패', DRAW: '무' };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function BattleHistorySection({ crewId }: { crewId: string }) {
  const [history, setHistory] = useState<BattleHistoryEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load(offset: number, append: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`/api/crew/${crewId}/battle/history?offset=${offset}`);
      const data = await res.json();
      if (!res.ok) {
        if (!append) setHistory([]);
        setHasMore(false);
        return;
      }
      setHistory((prev) => (append ? [...(prev ?? []), ...(data.history ?? [])] : data.history ?? []));
      setHasMore(Boolean(data.hasMore));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="battle-history-card">
      <div className="card-head">
        <h2>이전 배틀 기록</h2>
      </div>
      {history === null ? (
        <button className="primary-btn battle-history-search-btn" onClick={() => load(0, false)} disabled={loading}>
          <SearchIcon />
          {loading ? '조회 중...' : '이전 배틀기록 조회'}
        </button>
      ) : history.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>배틀 기록이 없어요.</p>
      ) : (
        <>
          <div className="battle-history-list">
            {history.map((entry) => (
              <div key={entry.battleId} className="battle-history-row">
                <span className="type-pill">{entry.metricType === 'DISTANCE' ? 'km 배틀' : '페이스 배틀'}</span>
                <strong>{entry.opponentCrewName}</strong>
                {entry.result ? (
                  <span className={`type-pill ${entry.result === 'WIN' ? 'success' : entry.result === 'DRAW' ? 'ended' : ''}`}>
                    {RESULT_LABEL[entry.result]}
                  </span>
                ) : (
                  <span className="type-pill ended">{entry.status === 'DECLINED' ? '거절됨' : '취소됨'}</span>
                )}
                <span className="muted">
                  {entry.startDate && entry.endDate ? `${formatDate(entry.startDate)} ~ ${formatDate(entry.endDate)}` : formatDate(entry.createdAt)}
                </span>
              </div>
            ))}
          </div>
          {hasMore && (
            <button className="ghost-btn full-width" style={{ marginTop: 12 }} onClick={() => load(history.length, true)} disabled={loading}>
              {loading ? '불러오는 중...' : '더보기'}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
