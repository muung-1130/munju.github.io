'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { StarRating } from './StarRating';
import { useAuthModal } from './AuthModalContext';
import { useChat } from './ChatContext';
import type { CourseReview } from '@/lib/courseSocial';

export function CourseReviewSection({ courseId, initialReviews }: { courseId: string; initialReviews: CourseReview[] }) {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();
  const { addMessage } = useChat();

  const [reviews, setReviews] = useState(initialReviews);
  const [overallRating, setOverallRating] = useState(0);
  const [surfaceRating, setSurfaceRating] = useState(0);
  const [sceneryRating, setSceneryRating] = useState(0);
  const [slopeRating, setSlopeRating] = useState(0);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);

  async function handleSubmit() {
    if (!session?.user) {
      openAuthModal();
      return;
    }
    if (overallRating === 0) {
      setError('전체 평점을 선택해주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overallRating, surfaceRating, sceneryRating, slopeRating, content })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '리뷰 등록에 실패했어요.');
        return;
      }

      setReviews((prev) => [
        {
          reviewId: `local-${Date.now()}`,
          userId: session.user!.id,
          nickname: session.user?.name ?? '나',
          overallRating,
          surfaceRating,
          sceneryRating,
          slopeRating,
          content,
          createdAt: new Date().toISOString()
        },
        ...prev
      ]);
      setOverallRating(0);
      setSurfaceRating(0);
      setSceneryRating(0);
      setSlopeRating(0);
      setContent('');
      addMessage({ from: 'ai', text: '평점 감사합니다! 앞으로 러너님의 코스 추천에 참고할게요! 🐶' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(reviewId: string) {
    if (!window.confirm('이 리뷰를 삭제할까요?')) return;
    const res = await fetch(`/api/courses/${courseId}/reviews/${reviewId}`, { method: 'DELETE' });
    if (res.ok) {
      setReviews((prev) => prev.filter((review) => review.reviewId !== reviewId));
    }
  }

  return (
    <div className="course-review-section">
      <h3>코스 리뷰</h3>

      {!session?.user ? (
        <div className="login-required-note">
          로그인을 먼저 해주세요!
          <div style={{ marginTop: 10 }}>
            <button type="button" className="ghost-btn" onClick={openAuthModal}>
              로그인하고 리뷰 남기기
            </button>
          </div>
        </div>
      ) : (
        <div className="course-review-form">
          <div className="review-rating-grid">
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
          <textarea
            className="review-textarea"
            placeholder="코스에 대한 리뷰를 남겨주세요."
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          {error && <p style={{ color: '#e5484d', fontWeight: 700, margin: 0 }}>{error}</p>}
          <button type="button" className="primary-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '등록 중...' : '등록'}
          </button>
        </div>
      )}

      <div className="course-review-list">
        {reviews.length === 0 ? (
          <p className="muted">아직 리뷰가 없어요. 첫 리뷰를 남겨보세요!</p>
        ) : (
          reviews.map((review) =>
            editingReviewId === review.reviewId ? (
              <EditReviewCard
                key={review.reviewId}
                courseId={courseId}
                review={review}
                onCancel={() => setEditingReviewId(null)}
                onSaved={(updated) => {
                  setReviews((prev) => prev.map((r) => (r.reviewId === updated.reviewId ? updated : r)));
                  setEditingReviewId(null);
                }}
              />
            ) : (
              <div key={review.reviewId} className="course-review-item">
                <div className="review-head">
                  <strong>{review.nickname}</strong>
                  <span>★ {review.overallRating.toFixed(1)}</span>
                  {session?.user?.id === review.userId && (
                    <div className="review-owner-actions">
                      <button type="button" onClick={() => setEditingReviewId(review.reviewId)}>
                        수정
                      </button>
                      <button type="button" onClick={() => handleDelete(review.reviewId)}>
                        삭제
                      </button>
                    </div>
                  )}
                </div>
                {review.content && <p>{review.content}</p>}
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

function EditReviewCard({
  courseId,
  review,
  onCancel,
  onSaved
}: {
  courseId: string;
  review: CourseReview;
  onCancel: () => void;
  onSaved: (updated: CourseReview) => void;
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
      const res = await fetch(`/api/courses/${courseId}/reviews/${review.reviewId}`, {
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
      <div className="review-rating-grid">
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
