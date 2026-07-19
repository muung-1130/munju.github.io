'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, PageTitle } from '@/components/UI';
import { formatMetricValue, metricLabel, type ChallengeType, type MetricType } from '@/lib/challengeFormat';

type ChallengeDetail = {
  challengeId: string;
  challengeType: ChallengeType;
  name: string;
  description: string | null;
  metricType: MetricType;
  targetValue: number;
  startAt: string;
  endAt: string;
  status: string;
  visibility: string;
  participantCount: number;
  myProgressValue: number | null;
  myProgressRatio: number | null;
  myStatus: string | null;
  creatorNickname: string | null;
  crewName: string | null;
  createdAt: string;
};

type LiveParticipant = {
  userId: string;
  nickname: string;
  progressValue: number;
  progressRatio: number;
  status: string;
  joinedAt: string;
};

type HallOfFameEntry = {
  userId: string;
  nickname: string;
  successCount: number;
  lastCompletedAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '준비중',
  ACTIVE: '진행중',
  COMPLETED: '종료',
  CANCELLED: '취소됨'
};

const VISIBILITY_LABEL: Record<string, string> = {
  PUBLIC: '전체 공개',
  PRIVATE: '비공개',
  CREW_ONLY: '크루 전용'
};

const LIVE_POLL_MS = 10000;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function ChallengeDetailPage() {
  const params = useParams<{ challengeId: string }>();
  const challengeId = params.challengeId;
  const [challenge, setChallenge] = useState<ChallengeDetail | null | undefined>(undefined);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[]>([]);

  useEffect(() => {
    fetch(`/api/challenges/${challengeId}`)
      .then((res) => (res.ok ? res.json() : { challenge: null }))
      .then((data) => setChallenge(data.challenge ?? null));
  }, [challengeId]);

  useEffect(() => {
    if (!challenge || challenge.challengeType !== 'PUBLIC') return;
    let cancelled = false;
    async function refresh() {
      const res = await fetch(`/api/challenges/${challengeId}/participants`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setParticipants(data.participants ?? []);
      setHallOfFame(data.hallOfFame ?? []);
    }
    refresh();
    const timer = setInterval(refresh, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [challenge, challengeId]);

  if (challenge === undefined) {
    return <p className="muted">불러오는 중...</p>;
  }
  if (challenge === null) {
    return (
      <div>
        <Link href="/challenges" className="back-link">← 챌린지 목록으로</Link>
        <Card>챌린지를 찾을 수 없어요.</Card>
      </div>
    );
  }

  const isPublic = challenge.challengeType === 'PUBLIC';

  return (
    <div>
      <Link href="/challenges" className="back-link">← 챌린지 목록으로</Link>
      <PageTitle
        title={challenge.name}
        subtitle={challenge.challengeType === 'PERSONAL' ? '혼자서 하는 챌린지에요.' : isPublic ? '다같이 참가하는 챌린지에요.' : undefined}
      />

      <Card>
        {challenge.description && <p style={{ marginBottom: 16 }}>{challenge.description}</p>}
        <div className="challenge-page-grid">
          <div className="challenge-detail-stat">
            <span className="muted">목표</span>
            <strong>
              {metricLabel(challenge.metricType)} · {formatMetricValue(challenge.metricType, challenge.targetValue)}
            </strong>
          </div>
          <div className="challenge-detail-stat">
            <span className="muted">기간</span>
            <strong>
              {formatDate(challenge.startAt)} ~ {formatDate(challenge.endAt)}
            </strong>
          </div>
          <div className="challenge-detail-stat">
            <span className="muted">상태</span>
            <strong>{STATUS_LABEL[challenge.status] ?? challenge.status}</strong>
          </div>
          <div className="challenge-detail-stat">
            <span className="muted">공개 범위</span>
            <strong>{VISIBILITY_LABEL[challenge.visibility] ?? challenge.visibility}</strong>
          </div>
          <div className="challenge-detail-stat">
            <span className="muted">만든 사람</span>
            <strong>{challenge.creatorNickname ?? '알 수 없음'}</strong>
          </div>
          {challenge.crewName && (
            <div className="challenge-detail-stat">
              <span className="muted">연결된 크루</span>
              <strong>{challenge.crewName}</strong>
            </div>
          )}
          <div className="challenge-detail-stat">
            <span className="muted">참가자 수</span>
            <strong>{challenge.participantCount.toLocaleString()}명</strong>
          </div>
          <div className="challenge-detail-stat">
            <span className="muted">만든 시각</span>
            <strong>{formatDateTime(challenge.createdAt)}</strong>
          </div>
        </div>

        {challenge.myProgressRatio !== null && (
          <div style={{ marginTop: 20 }}>
            <span className="muted">
              내 진행률 · {formatMetricValue(challenge.metricType, challenge.myProgressValue ?? 0)} /{' '}
              {formatMetricValue(challenge.metricType, challenge.targetValue)}
            </span>
            <div className="progress">
              <i style={{ width: `${Math.min(100, challenge.myProgressRatio)}%` }} />
            </div>
          </div>
        )}
      </Card>

      {isPublic && (
        <>
          <div className="section-title-row">
            <h2 className="section-title">실시간 참가 현황</h2>
          </div>
          <Card>
            {participants.length === 0 ? (
              <p className="muted">아직 참가자가 없어요.</p>
            ) : (
              <div className="challenge-participant-list">
                {participants.map((p) => (
                  <div key={p.userId} className="challenge-participant-row">
                    <span className="avatar-dot">{p.nickname[0]}</span>
                    <div className="challenge-participant-info">
                      <strong>{p.nickname}</strong>
                      <small>{formatDate(p.joinedAt)} 참여 · {p.status === 'COMPLETED' ? '완주' : '진행중'}</small>
                    </div>
                    <div className="progress" style={{ flex: 1 }}>
                      <i style={{ width: `${Math.min(100, p.progressRatio)}%` }} />
                    </div>
                    <span className="challenge-participant-pct">{p.progressRatio.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="section-title-row">
            <h2 className="section-title">명예의 전당</h2>
            <p className="muted" style={{ margin: 0 }}>이 챌린지 참가자 중 챌린지를 가장 많이 완주한 사람들이에요.</p>
          </div>
          <Card>
            {hallOfFame.length === 0 ? (
              <p className="muted">아직 완주 기록이 없어요.</p>
            ) : (
              <div className="hall-of-fame-list">
                {hallOfFame.map((entry, index) => (
                  <div key={entry.userId} className="hall-of-fame-row">
                    <span className="hall-of-fame-rank">{index + 1}</span>
                    <strong>{entry.nickname}</strong>
                    <span className="muted">{entry.successCount}회 완주</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
