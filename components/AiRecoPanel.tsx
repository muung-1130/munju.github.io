'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/UI';
import { useChat } from './ChatContext';

export type AiRecoCourse = { courseId: string; name: string; distanceM: number };

const AVERAGE_PACE_MIN_PER_KM = 6;

function estimatedTimeLabel(distanceM: number) {
  const minutes = Math.round((distanceM / 1000) * AVERAGE_PACE_MIN_PER_KM);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  return `${minutes}분`;
}

export function AiRecoPanel({ courses }: { courses: AiRecoCourse[] }) {
  const [index, setIndex] = useState(0);
  const { addMessage } = useChat();
  const course = courses.length > 0 ? courses[index % courses.length] : null;

  // 지금 보여주고 있는 추천 코스가 바뀔 때마다(처음 뜰 때 포함) AI 러닝 비서가 그 코스 이름으로
  // 말을 건다 — 화살표로 다음 코스를 넘기면 말풍선 내용도 그에 맞춰 바뀐다.
  useEffect(() => {
    if (!course) return;
    addMessage({ from: 'ai', text: `AI 추천 코스 3가지를 뽑아봤는데, ${course.name}는 어떠세요?` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.name]);

  if (!course) return null;

  return (
    <Card className="ai-reco-panel">
      <div className="card-head">
        <h3>오늘의 AI 추천 코스</h3>
        <span>AI 추천</span>
      </div>
      <p>오늘의 날씨와 평소 러닝 패턴에 따른 맞춤 코스를 추천해드릴게요!</p>
      <div className="ai-reco-inner">
        <strong>{course.name}</strong>
        <span>
          {(course.distanceM / 1000).toFixed(1)}km · 예상 시간 {estimatedTimeLabel(course.distanceM)}
        </span>
        <div className="ai-reco-actions">
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
        <a href={`/courses/${course.courseId}`} className="primary-btn full-width ai-reco-start-link">
          추천 코스로 달리기 →
        </a>
      </div>
    </Card>
  );
}
