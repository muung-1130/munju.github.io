'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { Card } from '@/components/UI';
import { CourseMapView } from '@/components/CourseMapView';
import type { CourseRoute } from '@/components/CourseMapView';
import { useAuthModal } from './AuthModalContext';
import { usePreferencesModal } from './PreferencesModalContext';
import { formatKstDateTime } from '@/lib/format';

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
  // true면 개인화된 추천이 아니라 선호도 미입력 사용자/미가입자가 공유하는 공용 기본 추천.
  isDefaultRecommendation?: boolean;
};

const AVERAGE_PACE_MIN_PER_KM = 6;
const ROUTE_COLOR = '#74BDEB';

function estimatedTimeLabel(distanceM: number) {
  const minutes = Math.round((distanceM / 1000) * AVERAGE_PACE_MIN_PER_KM);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  return `${minutes}분`;
}

function formatRecommendedAt(iso: string) {
  return formatKstDateTime(iso, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sendFeedback(recommendationId: string, courseId: string, feedbackType: 'CLICK' | 'LIKE' | 'START_RUN' | 'DISMISS') {
  fetch('/api/ai-recommendations/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({ recommendationId, courseId, feedbackType })
  }).catch(() => {});
}

export function AiRecoPanel({
  courses: initialCourses,
  locationSlot
}: {
  courses: AiRecoCourse[];
  /** 지도 바로 위에 띄울 요소(예: 홈페이지의 위치 확인 버튼). */
  locationSlot?: ReactNode;
}) {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();
  const { openPreferencesModal } = usePreferencesModal();
  const [courses, setCourses] = useState(initialCourses);
  const [index, setIndex] = useState(0);
  const [likePending, setLikePending] = useState(false);

  // 서버 렌더링 시점엔 브라우저 GPS를 모르므로 일단 기본 위치 기준 추천을 보여주고,
  // 마운트 후 실제 위치를 얻으면 그 좌표로 다시 조회한다 — "내 위치와 가까운 코스"를
  // 반영하기 위함. 오늘 추천이 이미 계산돼 있으면 서버가 하루 1회 제한으로 이 좌표를
  // 무시하고 기존 결과를 그대로 돌려주므로 Bedrock을 다시 호출하지 않는다.
  //
  // 서버가 더는 Bedrock 응답을 기다리지 않고 즉시 폴백(무작위 코스, recommendationId=null)으로
  // 응답하도록 바뀌었기 때문에(코스 탐색 페이지 지연 이슈 수정), 오늘 처음 방문했을 땐 이
  // 재조회도 아직 생성 중인 폴백을 받을 수 있다 — 그 경우 한 번만 몇 초 뒤 다시 조회해서
  // 백그라운드 생성이 끝났으면 실제 AI 추천으로 자연스럽게 갱신한다.
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function fetchPanel(coords: { latitude: number; longitude: number } | null, allowRetry: boolean) {
      const params = coords
        ? new URLSearchParams({ lat: String(coords.latitude), lng: String(coords.longitude) })
        : null;
      fetch(`/api/ai-recommendations/panel${params ? `?${params.toString()}` : ''}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data?.courses?.length) return;
          setCourses(data.courses);
          setIndex(0);
          const stillFallback = data.courses.every((c: AiRecoCourse) => c.recommendationId === null);
          if (stillFallback && allowRetry) {
            retryTimer = setTimeout(() => fetchPanel(coords, false), 6000);
          }
        })
        .catch(() => {});
    }

    if (!navigator.geolocation) {
      fetchPanel(null, true);
      return () => {
        cancelled = true;
        clearTimeout(retryTimer);
      };
    }
    navigator.geolocation.getCurrentPosition(
      (position) => fetchPanel({ latitude: position.coords.latitude, longitude: position.coords.longitude }, true),
      () => fetchPanel(null, true),
      { timeout: 8000 }
    );
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

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

  function handleDetailClick() {
    if (course?.recommendationId) sendFeedback(course.recommendationId, course.courseId, 'CLICK');
  }

  function handleStartRunClick() {
    if (course?.recommendationId) sendFeedback(course.recommendationId, course.courseId, 'START_RUN');
  }

  function handleAddPreferencesClick() {
    if (!session?.user) {
      openAuthModal();
      return;
    }
    openPreferencesModal();
  }

  return (
    <Card className="ai-reco-panel">
      <div className="card-head">
        <h3>오늘의 AI 추천 코스</h3>
        <span>AI 추천</span>
      </div>
      <p>오늘의 날씨와 평소 러닝 패턴에 따른 맞춤 코스를 추천해드릴게요!</p>
      {course.isDefaultRecommendation && (
        <div className="ai-reco-default-notice">
          <span>사용자 선호 정보가 없어서 기본 추천 정보를 안내해요!</span>
          <button type="button" className="ghost-btn small" onClick={handleAddPreferencesClick}>
            선호도 정보 추가
          </button>
        </div>
      )}
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
          {locationSlot && <div className="ai-reco-location-slot">{locationSlot}</div>}
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

          {course.recommendationId && (course.reason || course.createdAt) && (
            <div className="ai-reco-result">
              {course.reason && <p className="ai-reco-reason">{course.reason}</p>}
              {course.createdAt && (
                <p className="data-source-note">
                  AI 추천 · {formatRecommendedAt(course.createdAt)} · {course.modelVersion ?? '모델 정보 없음'} 기준
                </p>
              )}
            </div>
          )}

          <div className="ai-reco-primary-actions">
            {course.recommendationId && (
              <button
                type="button"
                className={`ai-reco-like-btn small ${course.likedByUser ? 'liked' : ''}`}
                onClick={handleLikeClick}
                disabled={likePending}
                aria-label={course.likedByUser ? '찜 완료' : '찜하기'}
              >
                <span className="heart">{course.likedByUser ? '❤️' : '🤍'}</span>
                {course.likeCount ? course.likeCount : ''}
              </button>
            )}
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
