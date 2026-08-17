'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/UI';

type CrewMember = {
  userId: string;
  nickname: string;
  role: string;
  joinedAt: string;
  last7DaysDistanceM: number;
  last7DaysRunCount: number;
  lastRunAt: string | null;
};

const ROLE_LABEL: Record<string, string> = { LEADER: '크루장', MANAGER: '운영진', MEMBER: '멤버' };

function formatLastRun(iso: string | null): string {
  if (!iso) return '아직 기록 없음';
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return '오늘';
  if (diffDays === 1) return '어제';
  return `${diffDays}일 전`;
}

export function CrewMembersSection({ crewId }: { crewId: string }) {
  const [members, setMembers] = useState<CrewMember[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crew/${crewId}/members`)
      .then((res) => (res.ok ? res.json() : { members: [] }))
      .then((data) => {
        if (!cancelled) setMembers(data.members ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [crewId]);

  return (
    <Card className="crew-members-card">
      <div className="card-head">
        <h2>크루원</h2>
        {members && <span className="muted">{members.length}명</span>}
      </div>
      {members === null ? (
        <p className="muted">불러오는 중...</p>
      ) : (
        <div className="crew-members-list">
          {members.map((member) => (
            <div key={member.userId} className="crew-member-row">
              <div className="crew-member-info">
                <strong>{member.nickname}</strong>
                <span className="type-pill">{ROLE_LABEL[member.role] ?? member.role}</span>
              </div>
              <div className="crew-member-stats">
                <span>🏃 최근 7일 {(member.last7DaysDistanceM / 1000).toFixed(1)}km · {member.last7DaysRunCount}회</span>
                <span className="muted">마지막 러닝 {formatLastRun(member.lastRunAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
