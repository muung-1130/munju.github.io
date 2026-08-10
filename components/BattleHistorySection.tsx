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

export function BattleHistorySection({ crewId }: { crewId: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [history, setHistory] = useState<BattleHistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/crew/${crewId}/battle/history?${params.toString()}`);
      const data = await res.json();
      setHistory(res.ok ? (data.history ?? []) : []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="battle-history-card">
      <div className="card-head">
        <h2>이전 배틀 기록</h2>
      </div>
      <div className="battle-history-filters">
        <label>
          시작일
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          종료일
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="primary-btn" onClick={search} disabled={loading}>
          {loading ? '검색 중...' : '검색'}
        </button>
      </div>
      {history === null ? (
        <p className="muted" style={{ marginTop: 12 }}>
          기간을 선택하고 검색해보세요. 비워두면 전체 기록을 볼 수 있어요.
        </p>
      ) : history.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>해당 기간에 배틀 기록이 없어요.</p>
      ) : (
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
      )}
    </Card>
  );
}
