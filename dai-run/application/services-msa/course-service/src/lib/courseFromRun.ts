import { randomUUID } from 'node:crypto';
import { getPool } from './db.js';

export type CreateCourseFromRunInput = {
  ownerUserId: string;
  courseName: string;
  distanceM: number;
  positions: [number, number][];
};

// 사용자의 자율 달리기 기록을 코스 탐색에 노출되는 코스로 등록한다. course_id는 기존
// 공공데이터 코스(SEOUL_C001 등)와 겹치지 않도록 USER_ 접두어 + UUID로 발급한다.
// owner_user_id만 저장해두면 리뷰/찜과 마찬가지로 조회 시 auth_user.users를 조인해 닉네임을
// 붙일 수 있다(lib/courseSocial.ts의 getCourseOwnerProfile 참고) — 여기서 닉네임을 복사해두지 않는다.
export async function createCourseFromRun(input: CreateCourseFromRunInput): Promise<string> {
  const pool = getPool();
  const courseId = `USER_${randomUUID()}`;
  const routeGeom = `SRID=4326;LINESTRING(${input.positions.map(([lat, lng]) => `${lng} ${lat}`).join(',')})`;

  await pool.query(
    `INSERT INTO course.courses (course_id, owner_user_id, course_name, source_type, distance_m, route_geom, visibility, status)
     VALUES ($1, $2, $3, 'USER', $4, ST_GeomFromEWKT($5), 'PUBLIC', 'ACTIVE')`,
    [courseId, input.ownerUserId, input.courseName, Math.round(input.distanceM), routeGeom]
  );

  return courseId;
}
