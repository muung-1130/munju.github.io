import Link from 'next/link';
import { Card } from '@/components/UI';

type UserCourseReview = {
  reviewId: string;
  courseId: string;
  courseName: string;
  overallRating: number;
  content: string | null;
  createdAt: string;
};

function formatReviewDate(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function MyCourseReviewsSection({ reviews }: { reviews: UserCourseReview[] }) {
  return (
    <Card className="mypage-course-reviews-card">
      <div className="card-head">
        <h2>내가 남긴 리뷰</h2>
      </div>
      {reviews.length === 0 ? (
        <p className="muted">아직 남긴 리뷰가 없어요. 코스 탐색에서 다녀온 코스에 리뷰를 남겨보세요.</p>
      ) : (
        <div className="mypage-liked-shoes-list">
          {reviews.map((review) => (
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
              <Link href={`/courses/${review.courseId}`} className="ghost-btn">
                코스 보기
              </Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
