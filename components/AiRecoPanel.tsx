'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card } from '@/components/UI';
import { CourseMapView } from '@/components/CourseMapView';
import type { CourseRoute } from '@/components/CourseMapView';
import { useAuthModal } from './AuthModalContext';

export type AiRecoCourse = {
  // null이면 실제 AI 추천이 아니라 (로그인 전이거나 아직 추천이 없어서) 대체로 보여주는
  // 무작위 코스 — 이 경우 점수/피드백 UI 전체를 숨긴다.
  recommendationId: string | null;
  courseId: string;
  name: string;
  distanceM: number;
  positions: [number, number][];
  rankNo?: number | null;
  slotLabel?: string | null;
  score?: number | null;
  distanceScore?: number | null;
  difficultyScore?: number | null;
  environmentScore?: number | null;
  preferenceScore?: number | null;
  reason?: string | null;
  createdAt?: string | null;
  modelVersion?: string | null;
  likedByUser?: boolean;
  likeCount?: number;
};

const AVERAGE_PACE_MIN_PER_KM = 6;
const ROUTE_COLOR = '#1259ee';

function estimatedTimeLabel(distanceM: number) {
  const minutes = Math.round((distanceM / 1000) * AVERAGE_PACE_MIN_PER_KM);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  return `${minutes}분`;
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value)}점`;
}

function formatRecommendedAt(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function sendFeedback(recommendationId: string, courseId: string, feedbackType: 'CLICK' | 'LIKE' | 'START_RUN' | 'DISMISS') {
  fetch('/api/ai-recommendations/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({ recommendationId, courseId, feedbackType })
  }).catch(() => {});
}

export function AiRecoPanel({ courses: initialCourses }: { courses: AiRecoCourse[] }) {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();
  const [courses, setCourses] = useState(initialCourses);
  const [index, setIndex] = useState(0);
  const [likePending, setLikePending] = useState(false);
  const [dismissPending, setDismissPending] = useState(false);

  const course = courses.length > 0 ? courses[index % courses.length] : null;

  if (!course) return null;

  const route: CourseRoute = {
    id: course.courseId,
    name: course.name,
    color: ROUTE_COLOR,
    positions: course.positions
  };

  async function handleLikeClick() {
    if (!course) return;
    if (!session?.user) {
      openAuthModal();
      return;
    }
    if (likePending) return;
    setLikePending(true);
    try {
      const res = await fetch(`/api/courses/${course.courseId}/like`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCourses((prev) =>
          prev.map((c) => (c.courseId === course.courseId ? { ...c, likedByUser: data.likedByUser, likeCount: data.likeCount } : c))
        );
        if (data.likedByUser && course.recommendationId) {
          sendFeedback(course.recommendationId, course.courseId, 'LIKE');
        }
      }
    } finally {
      setLikePending(false);
    }
  }

  async function handleDismissClick() {
    if (!course || !course.recommendationId || dismissPending) return;
    setDismissPending(true);
    try {
      await fetch('/api/ai-recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId: course.recommendationId, courseId: course.courseId, feedbackType: 'DISMISS' })
      });
      setCourses((prev) => prev.filter((c) => c.courseId !== course.courseId));
      setIndex(0);
    } finally {
      setDismissPending(false);
    }
  }

  function handleDetailClick() {
    if (course?.recommendationId) sendFeedback(course.recommendationId, course.courseId, 'CLICK');
  }

  function handleStartRunClick() {
    if (course?.recommendationId) sendFeedback(course.recommendationId, course.courseId, 'START_RUN');
  }

  return (
    <Card className="ai-reco-panel">
      <div className="card-head">
        <h3>오늘의 AI 추천 코스</h3>
        <span>AI 추천</span>
      </div>
      <p>오늘의 날씨와 평소 러닝 패턴에 따른 맞춤 코스를 추천해드릴게요!</p>
      <div className="ai-reco-inner">
        <button
          type="button"
          className="ai-reco-edge-arrow ai-reco-edge-prev"
          aria-label="이전 추천 코스"
          onClick={() => setIndex((i) => (i - 1 + courses.length) % courses.length)}
        >
          ‹
        </button>

        <div className="ai-reco-media">
          {course.recommendationId && course.slotLabel && <span className="ai-reco-slot-badge">{course.slotLabel}</span>}
          {course.positions.length > 0 && (
            <div className="ai-reco-map">
              <CourseMapView routes={[route]} height={320} scrollWheelZoom />
            </div>
          )}
        </div>

        <div className="ai-reco-content">
          <strong>{course.name}</strong>
          <span>
            {(course.distanceM / 1000).toFixed(1)}km · 예상 시간 {estimatedTimeLabel(course.distanceM)}
          </span>

          {course.recommendationId && (
            <>
              <div className="ai-reco-result">
                {course.reason && <p className="ai-reco-reason">{course.reason}</p>}
                <div className="ai-reco-score-total-row">
                  <span>종합 적합도</span>
                  <strong>{formatScore(course.score)}</strong>
                </div>
                <div className="ai-reco-scores">
                  <div className="ai-reco-score-item">
                    <span>거리</span>
                    <strong>{formatScore(course.distanceScore)}</strong>
                  </div>
                  <div className="ai-reco-score-item">
                    <span>난이도</span>
                    <strong>{formatScore(course.difficultyScore)}</strong>
                  </div>
                  <div className="ai-reco-score-item">
                    <span>환경</span>
                    <strong>{formatScore(course.environmentScore)}</strong>
                  </div>
                  <div className="ai-reco-score-item">
                    <span>취향</span>
                    <strong>{formatScore(course.preferenceScore)}</strong>
                  </div>
                </div>
                {course.createdAt && (
                  <p className="data-source-note">
                    AI 추천 · {formatRecommendedAt(course.createdAt)} · {course.modelVersion ?? '모델 정보 없음'} 기준
                  </p>
                )}
              </div>

              <div className="ai-reco-feedback-actions">
                <button type="button" className={`ai-reco-like-btn ${course.likedByUser ? 'liked' : ''}`} onClick={handleLikeClick} disabled={likePending}>
                  <span className="heart">{course.likedByUser ? '❤️' : '🤍'}</span>
                  {course.likedByUser ? '찜 완료' : '찜하기'} {course.likeCount ? `· ${course.likeCount}` : ''}
                </button>
                <button type="button" className="ai-reco-dismiss-btn" onClick={handleDismissClick} disabled={dismissPending}>
                  마음에 안 들어요
                </button>
              </div>
            </>
          )}

          <div className="ai-reco-actions">
            <a href={`/courses/${course.courseId}`} className="ai-reco-detail-link" onClick={handleDetailClick}>
              코스 자세히 보기
            </a>
          </div>
          <a href={`/run/${course.courseId}`} className="primary-btn full-width ai-reco-start-link" onClick={handleStartRunClick}>
            추천 코스로 달리기 →
          </a>
        </div>

        <button
          type="button"
          className="ai-reco-edge-arrow ai-reco-edge-next"
          aria-label="다음 추천 코스"
          onClick={() => setIndex((i) => (i + 1) % courses.length)}
        >
          ›
        </button>
      </div>
    </Card>
  );
}
