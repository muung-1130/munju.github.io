'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, PageTitle } from '@/components/UI';
import { useAuthModal } from '@/components/AuthModalContext';
import { formatMetricValue, type ChallengeType, type MetricType } from '@/lib/challengeFormat';

type ChallengeSummary = {
  challengeId: string;
  challengeType: ChallengeType;
  name: string;
  description: string | null;
  metricType: MetricType;
  targetValue: number;
  startAt: string;
  endAt: string;
  status: string;
  participantCount: number;
  myProgressValue: number | null;
  myProgressRatio: number | null;
  myStatus: string | null;
};

const CHALLENGE_ICONS: Record<string, string> = {
  DISTANCE: '👟',
  PACE: '⚡',
  STREAK: '🔥',
  COUNT: '🏆'
};

function daysLeft(endAt: string): number {
  const diff = new Date(endAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function ChallengesPage() {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();
  const [personal, setPersonal] = useState<ChallengeSummary[] | null>(null);
  const [publicChallenges, setPublicChallenges] = useState<ChallengeSummary[] | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  function load() {
    fetch('/api/challenges')
      .then((res) => (res.ok ? res.json() : { personal: [], public: [] }))
      .then((data) => {
        setPersonal(data.personal ?? []);
        setPublicChallenges(data.public ?? []);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function joinChallenge(challengeId: string) {
    if (!session?.user) {
      openAuthModal();
      return;
    }
    setJoiningId(challengeId);
    try {
      const res = await fetch(`/api/challenges/${challengeId}/join`, { method: 'POST' });
      if (res.ok) load();
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <div>
      <PageTitle title="챌린지" subtitle="거리, 출석, 페이스 목표를 설정하고 성장 흐름을 확인하세요." />

      <div className="section-title-row">
        <div>
          <h2 className="section-title">공개 챌린지 찾아보기</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>다같이 참가하는 챌린지에요.</p>
        </div>
        <button className="primary-btn">챌린지 만들기</button>
      </div>
      <div className="public-challenge-grid">
        {publicChallenges === null ? (
          <p className="muted">불러오는 중...</p>
        ) : publicChallenges.length === 0 ? (
          <Card>아직 공개 챌린지가 없어요.</Card>
        ) : (
          publicChallenges.map((challenge) => {
            const joined = challenge.myStatus === 'ACTIVE';
            return (
              <Card key={challenge.challengeId} className="public-challenge-card">
                <div className="card-head">
                  <span className="type-pill">공개</span>
                </div>
                <div className="challenge-icon small">{CHALLENGE_ICONS[challenge.metricType] ?? '🏅'}</div>
                <h3>{challenge.name}</h3>
                <p>{challenge.description}</p>
                <div className="public-challenge-meta">
                  <span>🎯 목표 {formatMetricValue(challenge.metricType, challenge.targetValue)}</span>
                  <span>👥 {challenge.participantCount.toLocaleString()}명 참가</span>
                  <span>⏳ {challenge.status === 'COMPLETED' ? '종료' : `D-${daysLeft(challenge.endAt)}`}</span>
                </div>
                {joined && challenge.myProgressRatio !== null && (
                  <div className="progress">
                    <i style={{ width: `${Math.min(100, challenge.myProgressRatio)}%` }} />
                  </div>
                )}
                <Link href={`/challenges/${challenge.challengeId}`} className="ghost-btn full-width" style={{ marginBottom: 8 }}>
                  상세 보기
                </Link>
                <button
                  className={`ghost-btn full-width ${joined ? 'joined' : ''}`}
                  onClick={() => joinChallenge(challenge.challengeId)}
                  disabled={joined || joiningId === challenge.challengeId}
                >
                  {joined ? '참여 완료 ✓' : joiningId === challenge.challengeId ? '참여 중...' : '참여하기'}
                </button>
              </Card>
            );
          })
        )}
      </div>

      <div className="section-title-row">
        <div>
          <h2 className="section-title">개인 챌린지</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>혼자서 하는 챌린지에요.</p>
        </div>
        <button className="primary-btn">챌린지 만들기</button>
      </div>
      <div className="challenge-page-grid">
        {personal === null ? (
          <p className="muted">불러오는 중...</p>
        ) : personal.length === 0 ? (
          <Card>아직 개인 챌린지가 없어요.</Card>
        ) : (
          personal.map((challenge) => (
            <Card key={challenge.challengeId} className="challenge-big-card">
              <div className="card-head">
                <span className="type-pill">개인</span>
              </div>
              <div className="challenge-icon">{CHALLENGE_ICONS[challenge.metricType] ?? '👟'}</div>
              <h2>{challenge.name}</h2>
              <p>
                {challenge.myProgressValue !== null
                  ? `${formatMetricValue(challenge.metricType, challenge.myProgressValue)} / ${formatMetricValue(challenge.metricType, challenge.targetValue)}`
                  : `목표 ${formatMetricValue(challenge.metricType, challenge.targetValue)}`}
              </p>
              <div className="progress">
                <i style={{ width: `${Math.min(100, challenge.myProgressRatio ?? 0)}%` }} />
              </div>
              <span className="muted">진행률 {(challenge.myProgressRatio ?? 0).toFixed(0)}%</span>
              <Link href={`/challenges/${challenge.challengeId}`} className="ghost-btn">
                상세 보기
              </Link>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
