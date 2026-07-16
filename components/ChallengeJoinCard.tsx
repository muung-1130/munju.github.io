'use client';

import { useState } from 'react';
import { Card } from '@/components/UI';

export function ChallengeJoinCard() {
  const [joined, setJoined] = useState(false);

  return (
    <Card className="challenge-card-home">
      <h3>추천 챌린지</h3>
      <div className="badge-hero">👟<span>100K</span></div>
      <strong>5월 100K 챌린지</strong>
      <p>100km 달성하고 한정 배지 받아보세요!</p>
      <div className="progress"><i style={{ width: '62%' }} /></div>
      <span className="muted">62.1 / 100 km</span>
      <button className={`ghost-btn ${joined ? 'joined' : ''}`} onClick={() => setJoined(true)} disabled={joined}>
        {joined ? '참여 완료 ✓' : '챌린지 참여하기'}
      </button>
    </Card>
  );
}
