'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, PageTitle } from '@/components/UI';
import { useAuthModal } from '@/components/AuthModalContext';
import { CreateChallengeModal } from '@/components/CreateChallengeModal';
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

// "종료까지 며칠"(D-6)이 아니라 "시작한지 며칠째"(D+2)를 보여준다 — 매주 반복되는 챌린지라
// 종료일보다 지금이 몇 일차인지가 더 와닿는다는 판단.
function daysSinceStart(startAt: string): number {
  const startKst = new Date(startAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const todayKst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const diffMs = new Date(`${todayKst}T00:00:00Z`).getTime() - new Date(`${startKst}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

export default function ChallengesPage() {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();
  const router = useRouter();
  const [personal, setPersonal] = useState<ChallengeSummary[] | null>(null);
  const [publicChallenges, setPublicChallenges] = useState<ChallengeSummary[] | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<{ id: string; message: string } | null>(null);
  const [joinNotice, setJoinNotice] = useState<{ id: string; message: string } | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createModalType, setCreateModalType] = useState<'PUBLIC' | 'PERSONAL' | null>(null);

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
    setJoinError(null);
    setJoinNotice(null);
    try {
      const res = await fetch(`/api/challenges/${challengeId}/join`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.waiting) {
          setJoinNotice({ id: challengeId, message: '참여 신청이 완료됐어요! 월요일부터 시작되니, 그 전까지 대기 리스트에 등록해드릴게요.' });
        }
        load();
      } else {
        setJoinError({ id: challengeId, message: data.error ?? '참여할 수 없어요.' });
      }
    } finally {
      setJoiningId(null);
    }
  }

  async function leaveChallenge(challengeId: string, progressRatio: number | null) {
    const ratio = Math.round(progressRatio ?? 0);
    const confirmed = confirm(
      ratio > 0
        ? `정말 그만두시겠어요? 현재 ${ratio}% 달성했어요 — 조금만 더 채워서 완주해보는 건 어때요?`
        : '정말 그만두시겠어요?'
    );
    if (!confirmed) return;
    setLeavingId(challengeId);
    try {
      const res = await fetch(`/api/challenges/${challengeId}/leave`, { method: 'POST' });
      if (res.ok) load();
    } finally {
      setLeavingId(null);
    }
  }

  async function deletePersonalChallenge(challengeId: string) {
    if (!confirm('이 챌린지를 삭제할까요? 삭제하면 되돌릴 수 없어요.')) return;
    setDeletingId(challengeId);
    try {
      const res = await fetch(`/api/challenges/${challengeId}`, { method: 'DELETE' });
      if (res.ok) load();
    } finally {
      setDeletingId(null);
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
        <button className="primary-btn" onClick={() => (session?.user ? setCreateModalType('PUBLIC') : openAuthModal())}>
          챌린지 만들기
        </button>
      </div>
      <div className="public-challenge-grid">
        {publicChallenges === null ? (
          <p className="muted">불러오는 중...</p>
        ) : publicChallenges.length === 0 ? (
          <Card>아직 공개 챌린지가 없어요.</Card>
        ) : (
          publicChallenges.map((challenge) => {
            const joined = challenge.myStatus === 'ACTIVE';
            const waiting = challenge.myStatus === 'WAITING';
            // 이 회차 자체가 끝났으면(스케줄러가 다음 회차를 아직 안 만들었거나 series 없는 일회성
            // 챌린지) 종료 다음날까지만 이 카드가 보인다(조회 쿼리에서 이미 그렇게 걸러져 있다) —
            // "참여하기"가 아니라 "재참여하기"로 바꾸고, 완주/미달성 여부를 보여준다.
            const ended = challenge.status !== 'ACTIVE';
            const endedCompleted = ended && challenge.myStatus === 'COMPLETED';
            const endedFailed = ended && challenge.myStatus === 'FAILED';
            return (
              <Card key={challenge.challengeId} className="public-challenge-card">
                <div className="card-head">
                  <span className="type-pill">공개</span>
                  {ended && <span className={`type-pill ${endedCompleted ? 'success' : 'ended'}`}>{endedCompleted ? '완료됨' : endedFailed ? '미달성' : '종료'}</span>}
                </div>
                <div className="challenge-icon small">{CHALLENGE_ICONS[challenge.metricType] ?? '🏅'}</div>
                <h3>{challenge.name}</h3>
                <p>{challenge.description}</p>
                <div className="public-challenge-meta">
                  <span>🎯 목표 {formatMetricValue(challenge.metricType, challenge.targetValue)}</span>
                  <span>👥 {challenge.participantCount.toLocaleString()}명 참가</span>
                  <span>⏳ {ended ? '종료' : `D+${daysSinceStart(challenge.startAt)}`}</span>
                </div>
                {(joined || ended) && challenge.myProgressRatio !== null && (
                  <>
                    <div className="progress">
                      <i style={{ width: `${Math.min(100, challenge.myProgressRatio)}%` }} />
                    </div>
                    {ended && <span className="muted">{challenge.myProgressRatio.toFixed(0)}% 달성하고 종료됐어요</span>}
                  </>
                )}
                <Link href={`/challenges/${challenge.challengeId}`} className="ghost-btn full-width" style={{ marginBottom: 8 }}>
                  상세 보기
                </Link>
                {!ended && (joined || waiting) ? (
                  <div className="challenge-joined-actions">
                    <button className={`ghost-btn full-width ${joined ? 'joined' : 'waiting'}`} disabled>
                      {joined ? '참여 완료 ✓' : '대기 중 (다음 주부터)'}
                    </button>
                    <button
                      className="ghost-btn full-width"
                      disabled={leavingId === challenge.challengeId}
                      onClick={() => leaveChallenge(challenge.challengeId, challenge.myProgressRatio)}
                    >
                      {leavingId === challenge.challengeId ? '처리 중...' : '그만두기'}
                    </button>
                  </div>
                ) : (
                  <button
                    className="ghost-btn full-width"
                    onClick={() => joinChallenge(challenge.challengeId)}
                    disabled={joiningId === challenge.challengeId}
                  >
                    {joiningId === challenge.challengeId ? '참여 중...' : ended ? '재참여하기' : '참여하기'}
                  </button>
                )}
                {joinError?.id === challenge.challengeId && <p className="field-error">{joinError.message}</p>}
                {joinNotice?.id === challenge.challengeId && <p className="field-ok">{joinNotice.message}</p>}
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
        <button className="primary-btn" onClick={() => (session?.user ? setCreateModalType('PERSONAL') : openAuthModal())}>
          챌린지 만들기
        </button>
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
              <div className="challenge-personal-actions">
                <Link href={`/challenges/${challenge.challengeId}`} className="ghost-btn">
                  상세 보기
                </Link>
                <button
                  className="ghost-btn"
                  disabled={deletingId === challenge.challengeId}
                  onClick={() => deletePersonalChallenge(challenge.challengeId)}
                >
                  {deletingId === challenge.challengeId ? '삭제 중...' : '삭제'}
                </button>
              </div>
            </Card>
          ))
        )}
      </div>

      {createModalType && (
        <CreateChallengeModal
          defaultType={createModalType}
          onClose={() => setCreateModalType(null)}
          onCreated={(challengeId) => {
            setCreateModalType(null);
            load();
            router.push(`/challenges/${challengeId}`);
          }}
        />
      )}
    </div>
  );
}
