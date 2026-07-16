'use client';

import { useState } from 'react';
import { Card, PageTitle } from '@/components/UI';

const challengeCards = [
  ['5월 100K 챌린지', '62.1 / 100km', '62%', '개인'],
  ['7일 연속 출석', '5 / 7일', '71%', '공개'],
  ['크루 평균 페이스 대결', '2위 유지 중', '82%', '크루'],
  ['마라토너의 보폭', '32 / 42km', '76%', '공개']
];

type PublicChallenge = {
  id: string;
  title: string;
  creatorType: '공식' | '사용자';
  creatorName?: string;
  description: string;
  goal: string;
  daysLeft: number;
  participants: number;
  icon: string;
};

const publicChallenges: PublicChallenge[] = [
  { id: 'c1', title: '30일 5K 완주 챌린지', creatorType: '공식', description: '30일 동안 매일 5km씩 달려보세요.', goal: '1회 5km · 30일', daysLeft: 12, participants: 1204, icon: '🏅' },
  { id: 'c2', title: '한강 종주 200km', creatorType: '공식', description: '한강의 모든 구간을 누적 거리로 정복해요.', goal: '누적 200km', daysLeft: 25, participants: 856, icon: '🌊' },
  { id: 'c3', title: "페이스 마스터 5'00\"", creatorType: '공식', description: '평균 페이스를 5분대 이내로 꾸준히 유지해보세요.', goal: "평균 5'00\"/km 이내", daysLeft: 9, participants: 432, icon: '⚡' },
  { id: 'c4', title: '아침러닝 인증 챌린지', creatorType: '사용자', creatorName: '러너제이', description: '매일 아침 6시, 인증샷과 함께 하루를 시작해요.', goal: '매일 아침 인증', daysLeft: 6, participants: 58, icon: '🌅' },
  { id: 'c5', title: '주말 20km 완주', creatorType: '사용자', creatorName: '한강모임장', description: '매주 주말 함께 20km 완주를 목표로 달려요.', goal: '주말 20km', daysLeft: 14, participants: 34, icon: '🏁' },
  { id: 'c6', title: '경사도 극복 챌린지', creatorType: '공식', description: '언덕과 계단, 누적 상승고도로 승부해요.', goal: '누적 상승고도 1,000m', daysLeft: 20, participants: 219, icon: '⛰️' },
  { id: 'c7', title: '한 달 습관 만들기', creatorType: '사용자', creatorName: '달림이', description: '30일 동안 주 4회 이상 달리는 습관을 만들어요.', goal: '주 4회 · 30일', daysLeft: 16, participants: 91, icon: '📅' },
  { id: 'c8', title: '자유 거리 100K', creatorType: '공식', description: '기간 내 자유롭게 누적 100km를 달성해보세요.', goal: '누적 100km', daysLeft: 8, participants: 3102, icon: '👟' }
];

const filterTabs = ['전체', '공식', '사용자 제작'] as const;

export default function ChallengesPage() {
  const [filter, setFilter] = useState<(typeof filterTabs)[number]>('전체');
  const [joinedIds, setJoinedIds] = useState<string[]>([]);

  const visiblePublicChallenges = publicChallenges.filter((challenge) => {
    if (filter === '전체') return true;
    if (filter === '공식') return challenge.creatorType === '공식';
    return challenge.creatorType === '사용자';
  });

  function toggleJoin(id: string) {
    setJoinedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  return (
    <div>
      <PageTitle title="챌린지" subtitle="거리, 출석, 페이스 목표를 설정하고 성장 흐름을 확인하세요." />

      <div className="section-title-row">
        <h2 className="section-title">개인 챌린지</h2>
        <button className="primary-btn">챌린지 만들기</button>
      </div>
      <div className="challenge-page-grid">
        {challengeCards.map((c, idx) => <Card key={c[0]} className="challenge-big-card"><div className="card-head"><span className="type-pill">{c[3]}</span><button>♡</button></div><div className="challenge-icon">{['👟','🔥','🏆','🏁'][idx]}</div><h2>{c[0]}</h2><p>{c[1]}</p><div className="progress"><i style={{ width: c[2] }} /></div><span className="muted">진행률 {c[2]}</span><button className="ghost-btn">상세 보기</button></Card>)}
      </div>

      <div className="section-title-row">
        <h2 className="section-title">공개 챌린지 찾아보기</h2>
        <div className="section-title-actions">
          <div className="segmented">
            {filterTabs.map((tab) => (
              <button key={tab} className={filter === tab ? 'active' : ''} onClick={() => setFilter(tab)}>{tab}</button>
            ))}
          </div>
          <button className="primary-btn">챌린지 만들기</button>
        </div>
      </div>
      <div className="public-challenge-grid">
        {visiblePublicChallenges.map((challenge) => {
          const joined = joinedIds.includes(challenge.id);
          return (
            <Card key={challenge.id} className="public-challenge-card">
              <div className="card-head">
                <span className="type-pill">{challenge.creatorType === '공식' ? '공식' : `사용자 · ${challenge.creatorName}`}</span>
              </div>
              <div className="challenge-icon small">{challenge.icon}</div>
              <h3>{challenge.title}</h3>
              <p>{challenge.description}</p>
              <div className="public-challenge-meta">
                <span>🎯 {challenge.goal}</span>
                <span>👥 {challenge.participants.toLocaleString()}명 참가</span>
                <span>⏳ D-{challenge.daysLeft}</span>
              </div>
              <button className={`ghost-btn full-width ${joined ? 'joined' : ''}`} onClick={() => toggleJoin(challenge.id)} disabled={joined}>
                {joined ? '참여 완료 ✓' : '참여하기'}
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
