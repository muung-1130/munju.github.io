'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/UI';
import { DIFFICULTY_LABEL } from '@/lib/courseDifficulty';

type LikedCourse = {
  courseId: string;
  courseName: string;
  distanceM: number | null;
  difficulty: number | null;
  region: string | null;
  likedAt: string;
};

export function LikedCoursesSection({ courses }: { courses: LikedCourse[] }) {
  const [list, setList] = useState(courses);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function unlike(courseId: string) {
    setBusyId(courseId);
    try {
      const res = await fetch(`/api/courses/${courseId}/like`, { method: 'POST' });
      if (res.ok) {
        setList((prev) => prev.filter((c) => c.courseId !== courseId));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mypage-liked-courses-card">
      <div className="card-head">
        <h2>찜한 러닝코스</h2>
      </div>
      {list.length === 0 ? (
        <p className="muted">찜한 코스가 없어요. 코스 탐색 페이지에서 하트를 눌러보세요.</p>
      ) : (
        <div className="mypage-liked-shoes-list">
          {list.map((course) => (
            <div key={course.courseId} className="mypage-liked-shoe-row">
              <div className="mypage-shoe-info">
                <Link href={`/courses/${course.courseId}`} className="text-link">
                  <strong>{course.courseName}</strong>
                </Link>
                <span className="muted">
                  {course.distanceM !== null ? `${(course.distanceM / 1000).toFixed(1)}km` : '거리 정보 없음'}
                  {course.difficulty !== null && ` · ${DIFFICULTY_LABEL[course.difficulty] ?? course.difficulty}`}
                  {course.region && ` · ${course.region}`}
                </span>
              </div>
              <Link href={`/courses/${course.courseId}`} className="ghost-btn">
                상세 보기
              </Link>
              <button className="heart liked" disabled={busyId === course.courseId} onClick={() => unlike(course.courseId)} aria-label="찜 해제">
                ♥
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
