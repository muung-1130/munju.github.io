// course.courses의 30개 코스를 대상으로:
// 1) course_waypoints가 START 1개뿐인 코스(22개)는 course_name/distance_m을 참고해 VIA·END 좌표를
//    임의로 합성해 course_waypoints에 추가한다 (사용자가 명시적으로 승인한 방식).
// 2) 모든 코스에 대해 순서대로 늘어선 waypoint들을 무료 공개 OSRM 보행자(foot) 라우팅 서버에 넘겨
//    실제 도로/보행로를 따르는 촘촘한 GPS 경로를 받아 course.courses.route_geom(LineString)에 저장한다.
//
// 실행: node db/enrich-course-routes.mjs

import { Client } from 'pg';
import { loadEnvFile } from './lib/load-env.mjs';

loadEnvFile(new URL('../.env', import.meta.url));

const OSRM_FOOT_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
const EARTH_RADIUS_M = 6371000;

function destinationPoint(lat, lng, bearingDeg, distanceM) {
  const bearing = (bearingDeg * Math.PI) / 180;
  const latOffset = (distanceM * Math.cos(bearing)) / 111320;
  const lngOffset = (distanceM * Math.sin(bearing)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + latOffset, lng: lng + lngOffset };
}

// course_name에 "A - B" 형태로 두 지점이 명시된 경우만 점-to-점 코스로 보고, 나머지는 전부
// 출발점으로 되돌아오는 순환 코스로 간주해 임의의 VIA/END를 만든다.
function isPointToPoint(courseName) {
  return / - /.test(courseName);
}

// course_id 문자열을 간단히 숫자로 해석해 코스마다 조금씩 다른 방향(bearing)을 쓰게 한다.
function seedFromId(courseId) {
  let hash = 0;
  for (const ch of courseId) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

function synthesizeWaypoints(course, start) {
  const seed = seedFromId(course.course_id);
  const distanceM = course.distance_m ?? 3000;

  if (isPointToPoint(course.course_name)) {
    const straightLineTarget = distanceM * 0.7; // 실제 도보 경로는 직선보다 기니 목표를 좀 짧게 잡는다
    const bearingToEnd = seed;
    const end = destinationPoint(start.lat, start.lng, bearingToEnd, straightLineTarget);
    const via = destinationPoint(start.lat, start.lng, bearingToEnd + 35, straightLineTarget * 0.5);
    return [
      { type: 'VIA', name: '경유점', point: via },
      { type: 'END', name: '도착', point: end }
    ];
  }

  // 순환 코스: 전체 거리를 원 둘레로 보고 반지름을 역산해 3개 지점으로 대략적인 루프를 만든다.
  const radius = distanceM / (2 * Math.PI);
  const via1 = destinationPoint(start.lat, start.lng, seed + 40, radius);
  const via2 = destinationPoint(start.lat, start.lng, seed + 150, radius * 1.05);
  const via3 = destinationPoint(start.lat, start.lng, seed + 260, radius * 0.9);
  return [
    { type: 'VIA', name: '경유점 1', point: via1 },
    { type: 'VIA', name: '경유점 2', point: via2 },
    { type: 'VIA', name: '경유점 3', point: via3 },
    { type: 'END', name: '도착(출발점 복귀)', point: start }
  ];
}

async function fetchRouteGeometry(waypoints) {
  const coordParam = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(';');
  const url = `${OSRM_FOOT_URL}/${coordParam}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM 요청 실패: ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`OSRM 경로 없음: ${data.code}`);
  }
  return data.routes[0].geometry; // GeoJSON LineString, [lng, lat] 순서
}

async function main() {
  const client = new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  });
  await client.connect();

  try {
    const { rows: courses } = await client.query(
      `SELECT course_id, course_name, distance_m FROM course.courses ORDER BY course_id`
    );

    for (const course of courses) {
      const { rows: waypointRows } = await client.query(
        `SELECT sequence_no, waypoint_type, latitude, longitude
           FROM course.course_waypoints
          WHERE course_id = $1
          ORDER BY sequence_no`,
        [course.course_id]
      );

      let waypoints = waypointRows.map((wp) => ({
        seq: wp.sequence_no,
        type: wp.waypoint_type,
        lat: Number(wp.latitude),
        lng: Number(wp.longitude)
      }));

      if (waypoints.length === 1) {
        const start = waypoints[0];
        const synthesized = synthesizeWaypoints(course, start);
        let nextSeq = start.seq + 1;
        for (const item of synthesized) {
          await client.query(
            `INSERT INTO course.course_waypoints
               (course_id, sequence_no, waypoint_type, point_name, latitude, longitude, location)
             VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, ST_SetSRID(ST_MakePoint($7::float8, $8::float8), 4326))`,
            [course.course_id, nextSeq, item.type, item.name, item.point.lat, item.point.lng, item.point.lng, item.point.lat]
          );
          waypoints.push({ seq: nextSeq, type: item.type, lat: item.point.lat, lng: item.point.lng });
          nextSeq += 1;
        }
        console.log(`[${course.course_id}] ${course.course_name}: VIA/END ${synthesized.length}개 합성`);
      }

      waypoints.sort((a, b) => a.seq - b.seq);

      try {
        const geometry = await fetchRouteGeometry(waypoints);
        await client.query(
          `UPDATE course.courses
              SET route_geom = ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), updated_at = now()
            WHERE course_id = $1`,
          [course.course_id, JSON.stringify(geometry)]
        );
        console.log(`[${course.course_id}] route_geom 저장 완료 (points=${geometry.coordinates.length})`);
      } catch (err) {
        console.error(`[${course.course_id}] OSRM/저장 실패:`, err.message);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
