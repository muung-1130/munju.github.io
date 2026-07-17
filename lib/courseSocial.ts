import { getPool } from '@/lib/db';
import { publishCourseLikeEvent } from '@/lib/kafka';

export type CourseOwnerProfile = {
  nickname: string;
  totalDistanceM: number;
};

// course.courses.owner_user_id로 auth_user.users의 닉네임과, running_record.runs에서
// 완료(COMPLETED)한 러닝 누적 거리를 함께 가져온다. owner_user_id가 없으면(관리자 코스) null.
export async function getCourseOwnerProfile(ownerUserId: string): Promise<CourseOwnerProfile | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ nickname: string | null; total_distance_m: string | null }>(
    `SELECT u.nickname,
            (SELECT SUM(r.distance_m) FROM running_record.runs r
              WHERE r.user_id = u.user_id AND r.status = 'COMPLETED') AS total_distance_m
       FROM auth_user.users u
      WHERE u.user_id = $1 AND u.deleted_at IS NULL`,
    [ownerUserId]
  );
  const row = rows[0];
  if (!row || !row.nickname) return null;
  return { nickname: row.nickname, totalDistanceM: Number(row.total_distance_m ?? 0) };
}

export async function getCourseLikeState(courseId: string, userId: string | null) {
  const pool = getPool();
  const { rows: countRows } = await pool.query<{ like_count: string }>(
    `SELECT COUNT(*) AS like_count FROM course.course_likes WHERE course_id = $1`,
    [courseId]
  );
  let likedByUser = false;
  if (userId) {
    const { rows } = await pool.query(
      `SELECT 1 FROM course.course_likes WHERE course_id = $1 AND user_id = $2`,
      [courseId, userId]
    );
    likedByUser = rows.length > 0;
  }
  return { likeCount: Number(countRows[0]?.like_count ?? 0), likedByUser };
}

// 찜 토글: 이미 눌렀으면 취소, 아니면 추가. course_likes(관계 테이블)는 이 요청 안에서 바로 쓰고,
// course_statistics.like_count 집계는 Kafka 이벤트로 흘려보내 별도 consumer가 비동기로 반영한다.
export async function toggleCourseLike(courseId: string, userId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `DELETE FROM course.course_likes WHERE course_id = $1 AND user_id = $2 RETURNING *`,
    [courseId, userId]
  );
  const liked = rows.length === 0;
  if (liked) {
    await pool.query(
      `INSERT INTO course.course_likes (course_id, user_id) VALUES ($1, $2)
       ON CONFLICT (course_id, user_id) DO NOTHING`,
      [courseId, userId]
    );
  }

  try {
    await publishCourseLikeEvent(courseId, userId, liked);
  } catch (err) {
    // Kafka가 잠깐 불안정해도 찜 자체(course_likes)는 이미 반영됐으니 사용자 응답은 막지 않는다.
    console.error('publishCourseLikeEvent 실패:', err);
  }

  return getCourseLikeState(courseId, userId);
}

export type CourseStatistics = {
  viewCount: number;
  likeCount: number;
  reviewAverage: number;
  reviewCount: number;
};

export async function incrementCourseViewCount(courseId: string) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO course.course_statistics (course_id, view_count)
     VALUES ($1, 1)
     ON CONFLICT (course_id) DO UPDATE
       SET view_count = course.course_statistics.view_count + 1, updated_at = now()`,
    [courseId]
  );
}

export async function getCourseStatisticsMap(courseIds: string[]): Promise<Map<string, CourseStatistics>> {
  if (courseIds.length === 0) return new Map();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT course_id, view_count, like_count, review_average, review_count
       FROM course.course_statistics WHERE course_id = ANY($1)`,
    [courseIds]
  );
  const map = new Map<string, CourseStatistics>();
  for (const row of rows) {
    map.set(row.course_id, {
      viewCount: Number(row.view_count),
      likeCount: Number(row.like_count),
      reviewAverage: Number(row.review_average),
      reviewCount: Number(row.review_count)
    });
  }
  return map;
}

export type CourseReview = {
  reviewId: string;
  nickname: string;
  overallRating: number;
  surfaceRating: number | null;
  sceneryRating: number | null;
  slopeRating: number | null;
  content: string | null;
  createdAt: string;
};

export async function getCourseReviews(courseId: string): Promise<CourseReview[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT r.review_id, u.nickname, r.overall_rating, r.surface_rating, r.scenery_rating, r.slope_rating,
            r.content, r.created_at
       FROM course.course_reviews r
       JOIN auth_user.users u ON u.user_id = r.user_id
      WHERE r.course_id = $1
      ORDER BY r.created_at DESC`,
    [courseId]
  );
  return rows.map((row) => ({
    reviewId: row.review_id,
    nickname: row.nickname,
    overallRating: Number(row.overall_rating),
    surfaceRating: row.surface_rating === null ? null : Number(row.surface_rating),
    sceneryRating: row.scenery_rating === null ? null : Number(row.scenery_rating),
    slopeRating: row.slope_rating === null ? null : Number(row.slope_rating),
    content: row.content,
    createdAt: row.created_at
  }));
}

export type CreateCourseReviewInput = {
  courseId: string;
  userId: string;
  overallRating: number;
  surfaceRating: number;
  sceneryRating: number;
  slopeRating: number;
  content: string;
};

export async function createCourseReview(input: CreateCourseReviewInput) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO course.course_reviews
       (course_id, user_id, overall_rating, surface_rating, scenery_rating, slope_rating, content)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.courseId,
      input.userId,
      input.overallRating,
      input.surfaceRating,
      input.sceneryRating,
      input.slopeRating,
      input.content
    ]
  );

  // 기존 review_average·review_count를 참고해 새 평균을 증분 계산한다:
  // new_avg = (old_avg*old_count + new_rating) / (old_count+1). 정밀한 값을 그대로 저장하고,
  // "버림 후 소수점 첫째 자리까지"만 보여주는 건 화면(UI) 쪽 책임으로 둔다.
  await pool.query(
    `INSERT INTO course.course_statistics (course_id, review_average, review_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (course_id) DO UPDATE
       SET review_average = (
             course.course_statistics.review_average * course.course_statistics.review_count + $2
           ) / (course.course_statistics.review_count + 1),
           review_count = course.course_statistics.review_count + 1,
           updated_at = now()`,
    [input.courseId, input.overallRating]
  );
}
