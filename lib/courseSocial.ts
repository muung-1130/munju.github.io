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

export type LikedCourse = {
  courseId: string;
  courseName: string;
  distanceM: number | null;
  difficulty: number | null;
  region: string | null;
  likedAt: string;
};

// 마이페이지 "찜한 러닝코스" 섹션용 — 내가 찜한 코스를 최근 찜한 순으로.
export async function getUserLikedCourses(userId: string): Promise<LikedCourse[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.course_id, c.course_name, c.distance_m, c.difficulty, c.region, cl.created_at
       FROM course.course_likes cl
       JOIN course.courses c ON c.course_id = cl.course_id
      WHERE cl.user_id = $1 AND c.status = 'ACTIVE' AND c.deleted_at IS NULL
      ORDER BY cl.created_at DESC`,
    [userId]
  );
  return rows.map((row) => ({
    courseId: row.course_id,
    courseName: row.course_name,
    distanceM: row.distance_m,
    difficulty: row.difficulty,
    region: row.region,
    likedAt: row.created_at
  }));
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
  userId: string;
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
    `SELECT r.review_id, r.user_id, u.nickname, r.overall_rating, r.surface_rating, r.scenery_rating, r.slope_rating,
            r.content, r.created_at
       FROM course.course_reviews r
       JOIN auth_user.users u ON u.user_id = r.user_id
      WHERE r.course_id = $1
      ORDER BY r.created_at DESC`,
    [courseId]
  );
  return rows.map((row) => ({
    reviewId: row.review_id,
    userId: row.user_id,
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

export type UpdateCourseReviewInput = {
  reviewId: string;
  userId: string;
  overallRating: number;
  surfaceRating: number;
  sceneryRating: number;
  slopeRating: number;
  content: string;
};

// 본인 리뷰만(WHERE user_id로 소유자 검증) 별점을 바꾸고, course_statistics.review_average는
// "이전 별점을 빼고 새 별점을 더하는" 식으로 재계산한다(review_count는 그대로).
export async function updateCourseReview(input: UpdateCourseReviewInput): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `WITH old AS (
       SELECT course_id, overall_rating FROM course.course_reviews
        WHERE review_id = $1 AND user_id = $2
     ),
     updated AS (
       UPDATE course.course_reviews r
          SET overall_rating = $3, surface_rating = $4, scenery_rating = $5, slope_rating = $6,
              content = $7, updated_at = now()
        WHERE r.review_id = $1 AND r.user_id = $2
        RETURNING r.course_id
     )
     UPDATE course.course_statistics s
        SET review_average = CASE WHEN s.review_count > 0
              THEN (s.review_average * s.review_count - old.overall_rating + $3) / s.review_count
              ELSE $3 END,
            updated_at = now()
       FROM old, updated
      WHERE s.course_id = updated.course_id
      RETURNING s.course_id`,
    [input.reviewId, input.userId, input.overallRating, input.surfaceRating, input.sceneryRating, input.slopeRating, input.content]
  );
  return (rowCount ?? 0) > 0;
}

// 본인 리뷰만 삭제하고, course_statistics.review_count를 줄이고 review_average를 그 리뷰의
// 별점을 뺀 값으로 재계산한다(0개가 되면 평균은 0으로).
export async function deleteCourseReview(reviewId: string, userId: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `WITH deleted AS (
       DELETE FROM course.course_reviews WHERE review_id = $1 AND user_id = $2
       RETURNING course_id, overall_rating
     )
     UPDATE course.course_statistics s
        SET review_count = GREATEST(s.review_count - 1, 0),
            review_average = CASE WHEN s.review_count - 1 > 0
              THEN (s.review_average * s.review_count - deleted.overall_rating) / (s.review_count - 1)
              ELSE 0 END,
            updated_at = now()
       FROM deleted
      WHERE s.course_id = deleted.course_id
      RETURNING s.course_id`,
    [reviewId, userId]
  );
  return (rowCount ?? 0) > 0;
}
