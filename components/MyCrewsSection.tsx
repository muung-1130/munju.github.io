'use client';

import { useState } from 'react';
import { Card } from '@/components/UI';
import { useCrewChat } from '@/components/CrewChatContext';

type MyCrewInfo = {
  crewId: string;
  crewName: string;
  description: string | null;
  regionCode: string | null;
  meetingLocation: string | null;
  role: string;
  memberCount: number;
  maxMembers: number;
  joinedAt: string;
};

const ROLE_LABEL: Record<string, string> = { LEADER: '크루장', MANAGER: '운영진', MEMBER: '멤버' };

export function MyCrewsSection({ crews }: { crews: MyCrewInfo[] }) {
  const { openCrewChat } = useCrewChat();
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function openChat(crew: MyCrewInfo) {
    setOpeningId(crew.crewId);
    try {
      const res = await fetch(`/api/crew/${crew.crewId}/chat/join`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) openCrewChat(crew.crewId, crew.crewName, data.messages ?? []);
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <Card className="mypage-crews-card">
      <div className="card-head">
        <h2>내 크루</h2>
      </div>
      {crews.length === 0 ? (
        <p className="muted">아직 가입한 크루가 없어요.</p>
      ) : (
        <div className="mypage-crew-list">
          {crews.map((crew) => (
            <div key={crew.crewId} className="mypage-crew-row">
              <div>
                <strong>{crew.crewName}</strong>
                <span className="type-pill">{ROLE_LABEL[crew.role] ?? crew.role}</span>
                <p className="muted">
                  📍 {crew.regionCode ?? '지역 무관'} · 👥 {crew.memberCount}/{crew.maxMembers}명
                  {crew.meetingLocation && ` · ${crew.meetingLocation}`}
                </p>
              </div>
              <button className="primary-btn" disabled={openingId === crew.crewId} onClick={() => openChat(crew)}>
                {openingId === crew.crewId ? '여는 중...' : '채팅방 보기'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
