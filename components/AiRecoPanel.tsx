'use client';

import { useState } from 'react';
import { Card } from '@/components/UI';
import { CourseMapView } from '@/components/CourseMapView';
import type { CourseRoute } from '@/components/CourseMapView';

export type AiRecoCourse = { courseId: string; name: string; distanceM: number; positions: [number, number][] };

const AVERAGE_PACE_MIN_PER_KM = 6;
const ROUTE_COLOR = '#1259ee';

function estimatedTimeLabel(distanceM: number) {
  const minutes = Math.round((distanceM / 1000) * AVERAGE_PACE_MIN_PER_KM);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  return `${minutes}분`;
}

export function AiRecoPanel({ courses }: { courses: AiRecoCourse[] }) {
  const [index, setIndex] = useState(0);
  const course = courses.length > 0 ? courses[index % courses.length] : null;

  if (!course) return null;

  const route: CourseRoute = {
    id: course.courseId,
    name: course.name,
    color: ROUTE_COLOR,
    positions: course.positions
  };

  return (
    <Card className="ai-reco-panel">
      <div className="card-head">
        <h3>오늘의 AI 추천 코스</h3>
        <span>AI 추천</span>
      </div>
      <p>오늘의 날씨와 평소 러닝 패턴에 따른 맞춤 코스를 추천해드릴게요!</p>
      <div className="ai-reco-inner">
        {course.positions.length > 0 && (
          <div className="ai-reco-map">
            <CourseMapView routes={[route]} height={180} />
          </div>
        )}
        <strong>{course.name}</strong>
        <span>
          {(course.distanceM / 1000).toFixed(1)}km · 예상 시간 {estimatedTimeLabel(course.distanceM)}
        </span>
        <div className="ai-reco-actions">
          {courses.length > 1 && (
            <button
              type="button"
              className="ai-reco-next ai-reco-prev"
              aria-label="이전 추천 코스"
              onClick={() => setIndex((i) => (i - 1 + courses.length) % courses.length)}
            >
              ‹
            </button>
          )}
          <a href={`/courses/${course.courseId}`} className="ai-reco-detail-link">
            코스 자세히 보기
          </a>
          {courses.length > 1 && (
            <button
              type="button"
              className="ai-reco-next"
              aria-label="다음 추천 코스"
              onClick={() => setIndex((i) => (i + 1) % courses.length)}
            >
              ›
            </button>
          )}
        </div>
        <a href={`/run/${course.courseId}`} className="primary-btn full-width ai-reco-start-link">
          추천 코스로 달리기 →
        </a>
      </div>
    </Card>
  );
}
