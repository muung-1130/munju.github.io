import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Card, PageTitle } from '@/components/UI';
import { CourseMapView } from '@/components/CourseMapView';
import type { CourseRoute } from '@/components/CourseMapView';
import { CourseOwnerBadge } from '@/components/CourseOwnerBadge';
import { CourseLikeButton } from '@/components/CourseLikeButton';
import { CourseReviewSection } from '@/components/CourseReviewSection';
import { getPool } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL } from '@/lib/course';
import { getCourseLikeState, getCourseOwnerProfile, getCourseReviews, incrementCourseViewCount } from '@/lib/courseSocial';

export const dynamic = 'force-dynamic';

type CourseDetailRow = {
  course_id: string;
  name: string;
  description: string | null;
  region: string | null;
  difficulty: number | null;
  distance_m: number;
  ownerUserId: string | null;
  positions: [number, number][];
};

async function getCourse(courseId: string): Promise<CourseDetailRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    course_id: string;
    course_name: string;
    description: string | null;
    region: string | null;
    difficulty: number | null;
    distance_m: number | null;
    owner_user_id: string | null;
    route_geojson: { coordinates: [number, number][] } | null;
  }>(
    `SELECT course_id, course_name, description, region, difficulty, distance_m, owner_user_id,
            ST_AsGeoJSON(route_geom) AS route_geojson
       FROM course.courses
      WHERE course_id = $1 AND deleted_at IS NULL`,
    [courseId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const geojson = typeof row.route_geojson === 'string' ? JSON.parse(row.route_geojson) : row.route_geojson;

  return {
    course_id: row.course_id,
    name: row.course_name,
    description: row.description,
    region: row.region,
    difficulty: row.difficulty,
    distance_m: row.distance_m ?? 0,
    ownerUserId: row.owner_user_id,
    // route_geom(도보 길찾기로 보간한 정밀 경로)은 [lng, lat] 순서라 Leaflet용 [lat, lng]로 뒤집는다.
    positions: (geojson?.coordinates ?? []).map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
  };
}

export default async function CourseDetailPage({ params }: { params: { courseId: string } }) {
  const course = await getCourse(params.courseId);
  if (!course) notFound();

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  const [owner, likeState, reviews] = await Promise.all([
    course.ownerUserId ? getCourseOwnerProfile(course.ownerUserId) : Promise.resolve(null),
    getCourseLikeState(course.course_id, userId),
    getCourseReviews(course.course_id),
    incrementCourseViewCount(course.course_id)
  ]);

  const difficulty = course.difficulty ?? 2;
  const route: CourseRoute = {
    id: course.course_id,
    name: course.name,
    color: DIFFICULTY_COLOR[difficulty],
    positions: course.positions
  };

  return (
    <div className="content-grid course-layout">
      <section className="main-column">
        <Link href="/courses" className="back-link">← 코스 탐색으로</Link>
        <PageTitle title={course.name} subtitle={`${course.region ?? ''} · ${(course.distance_m / 1000).toFixed(1)}km · ${DIFFICULTY_LABEL[difficulty]}`} />
        <Card className="map-card-large">
          <CourseMapView routes={[route]} height={440} scrollWheelZoom />
        </Card>
        {course.description && (
          <Card>
            <h3>코스 소개</h3>
            <p>{course.description}</p>
          </Card>
        )}
      </section>

      <aside className="side-column">
        <Card>
          <h3>코스 정보</h3>
          <p style={{ margin: '10px 0', color: '#53637a', fontWeight: 700 }}>
            {course.region ?? '지역 정보 없음'} · {(course.distance_m / 1000).toFixed(1)}km · {DIFFICULTY_LABEL[difficulty]}
          </p>
          <div style={{ margin: '0 0 16px', color: '#53637a', fontWeight: 700 }}>
            만든 사람 <CourseOwnerBadge owner={owner} />
          </div>
          <CourseLikeButton courseId={course.course_id} initialLiked={likeState.likedByUser} initialCount={likeState.likeCount} />
        </Card>
        <Card>
          <CourseReviewSection courseId={course.course_id} initialReviews={reviews} />
        </Card>
      </aside>
    </div>
  );
}
