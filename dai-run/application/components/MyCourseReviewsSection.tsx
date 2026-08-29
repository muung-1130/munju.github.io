'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/UI';
import { StarRating } from './StarRating';

type UserCourseReview = {
  reviewId: string;
  courseId: string;
  courseName: string;
  overallRating: number;
  surfaceRating: number | null;
  sceneryRating: number | null;
  slopeRating: number | null;
  content: string | null;
  createdAt: string;
};

function formatReviewDate(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function MyCourseReviewsSection({ reviews: initialReviews }: { reviews: UserCourseReview[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);

  async function handleDelete(review: UserCourseReview) {
    if (!window.confirm('이 리뷰를 삭제할까요?')) return;
    setDeletingReviewId(review.reviewId);
    try {
      const res = await fetch(`/api/courses/${review.courseId}/reviews/${review.reviewId}`, { method: 'DELETE' });
      if (res.ok) {
        setReviews((prev) => prev.filter((r) => r.reviewId !== review.reviewId));
      }
    } finally {
      setDeletingReviewId(null);
    }
  }

  return (
    <Card className="mypage-course-reviews-card">
      <div className="card-head">
        <h2>내가 남긴 리뷰</h2>
      </div>
      {reviews.length === 0 ? (
        <p className="muted">아직 남긴 리뷰가 없어요. 코스 탐색에서 다녀온 코스에 리뷰를 남겨보세요.</p>
      ) : (
        <div className="mypage-liked-shoes-list">
          {reviews.map((review) =>
            editingReviewId === review.reviewId ? (
              <EditMyReviewCard
                key={review.reviewId}
                review={review}
                onCancel={() => setEditingReviewId(null)}
                onSaved={(updated) => {
                  setReviews((prev) => prev.map((r) => (r.reviewId === updated.reviewId ? updated : r)));
                  setEditingReviewId(null);
                }}
              />
            ) : (
              <div key={review.reviewId} className="mypage-liked-shoe-row">
                <div className="mypage-shoe-info">
                  <Link href={`/courses/${review.courseId}`} className="text-link">
                    <strong>{review.courseName}</strong>
                  </Link>
                  <span className="muted">
                    ⭐ {review.overallRating.toFixed(1)} · {formatReviewDate(review.createdAt)}
                  </span>
                  {review.content && <p className="muted">{review.content}</p>}
                </div>
                <div className="review-owner-actions">
                  <button type="button" onClick={() => setEditingReviewId(review.reviewId)}>
                    수정
                  </button>
                  <button type="button" disabled={deletingReviewId === review.reviewId} onClick={() => handleDelete(review)}>
                    {deletingReviewId === review.reviewId ? '삭제 중...' : '삭제'}
                  </button>
                  <Link href={`/courses/${review.courseId}`} className="ghost-btn">
                    코스 보기
                  </Link>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </Card>
  );
}

function EditMyReviewCard({
  review,
  onCancel,
  onSaved
}: {
  review: UserCourseReview;
  onCancel: () => void;
  onSaved: (updated: UserCourseReview) => void;
}) {
  const [overallRating, setOverallRating] = useState(review.overallRating);
  const [surfaceRating, setSurfaceRating] = useState(review.surfaceRating ?? 0);
  const [sceneryRating, setSceneryRating] = useState(review.sceneryRating ?? 0);
  const [slopeRating, setSlopeRating] = useState(review.slopeRating ?? 0);
  const [content, setContent] = useState(review.content ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (overallRating === 0) {
      setError('전체 평점을 선택해주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${review.courseId}/reviews/${review.reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overallRating, surfaceRating, sceneryRating, slopeRating, content })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '리뷰 수정에 실패했어요.');
        return;
      }
      onSaved({ ...review, overallRating, surfaceRating, sceneryRating, slopeRating, content });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="course-review-item editing">
      <strong>{review.courseName}</strong>
      <div className="review-rating-grid" style={{ marginTop: 10 }}>
        <div className="review-rating-field">
          <label>전체 평점</label>
          <StarRating value={overallRating} onChange={setOverallRating} />
        </div>
        <div className="review-rating-field">
          <label>노면</label>
          <StarRating value={surfaceRating} onChange={setSurfaceRating} />
        </div>
        <div className="review-rating-field">
          <label>경치</label>
          <StarRating value={sceneryRating} onChange={setSceneryRating} />
        </div>
        <div className="review-rating-field">
          <label>경사</label>
          <StarRating value={slopeRating} onChange={setSlopeRating} />
        </div>
      </div>
      <textarea className="review-textarea" value={content} onChange={(event) => setContent(event.target.value)} />
      {error && <p style={{ color: '#e5484d', fontWeight: 700, margin: 0 }}>{error}</p>}
      <div className="review-owner-actions" style={{ marginTop: 10 }}>
        <button type="button" className="primary-btn" onClick={handleSave} disabled={submitting}>
          {submitting ? '저장 중...' : '저장'}
        </button>
        <button type="button" className="ghost-btn" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
