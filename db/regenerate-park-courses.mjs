// 공원 이름이 붙은 코스(SEOUL_C011/C014/C020/C021)의 합성 VIA/END 좌표가 실제 공원 경계를
// 벗어날 수 있다는 문제를 고쳐, Overpass(OSM)에서 받아온 실제 공원 폴리곤 안쪽으로만 좌표를
// 다시 생성한다. START는 그대로 두고 VIA/END만 교체한 뒤, OSRM 보행자 라우팅으로 다시
// route_geom을 만들고, 실제 만들어진 경로 길이로 distance_m도 갱신한다.
//
// 실행: node db/regenerate-park-courses.mjs

import { Client } from 'pg';
import { loadEnvFile } from './lib/load-env.mjs';
import { findEnclosingParkPolygon, pointInPolygon } from './lib/park-boundary.mjs';

loadEnvFile(new URL('../.env', import.meta.url));

const OSRM_FOOT_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
const TARGET_COURSE_IDS = ['SEOUL_C011', 'SEOUL_C014', 'SEOUL_C020', 'SEOUL_C021'];

function destinationPoint(lat, lng, bearingDeg, distanceM) {
  const bearing = (bearingDeg * Math.PI) / 180;
  const latOffset = (distanceM * Math.cos(bearing)) / 111320;
  const lngOffset = (distanceM * Math.sin(bearing)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + latOffset, lng: lng + lngOffset };
}

function seedFromId(courseId) {
  let hash = 0;
  for (const ch of courseId) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

// start에서 bearing 방향으로 targetDistanceM까지 뻗어보고, 폴리곤을 벗어나면 안쪽으로 들어오는
// 최대 거리를 찾은 뒤 15% 여유를 두어 실제 울타리/경계에 바짝 붙지 않게 한다.
function clampToPolygon(startLat, startLng, bearingDeg, targetDistanceM, polygon) {
  const pointAt = (distanceM) => destinationPoint(startLat, startLng, bearingDeg, distanceM);
  if (pointInPolygon(pointAt(targetDistanceM).lat, pointAt(targetDistanceM).lng, polygon)) {
    return pointAt(targetDistanceM * 0.9);
  }
  let lo = 0;
  let hi = targetDistanceM;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    const p = pointAt(mid);
    if (pointInPolygon(p.lat, p.lng, polygon)) lo = mid;
    else hi = mid;
  }
  return pointAt(lo * 0.85);
}

// 공원 안에서만 도는 경로를 만들 때는 경유점 사이 간격이 너무 벌어지면 OSRM이 공원 내부 산책로
// 대신 바깥 큰길로 돌아가는 경로를 골라버린다. 그래서 경유점 개수를 늘려(둘레를 따라 촘촘하게)
// 각 구간이 짧아지도록 만든다 — 그러면 바깥길로 크게 우회하는 게 손해라 내부 경로를 선택하게 된다.
const LOOP_VIA_COUNT = 7;

function synthesizeLoopWithinPolygon(course, start, polygon) {
  const seed = seedFromId(course.course_id);
  const distanceM = course.distance_m ?? 1500;
  const radius = distanceM / (2 * Math.PI);
  const step = 360 / (LOOP_VIA_COUNT + 1);

  const vias = [];
  for (let i = 1; i <= LOOP_VIA_COUNT; i++) {
    const bearing = seed + step * i;
    const point = clampToPolygon(start.lat, start.lng, bearing, radius, polygon);
    vias.push({ type: 'VIA', name: `경유점 ${i}`, point });
  }
  return [...vias, { type: 'END', name: '도착(출발점 복귀)', point: start }];
}

async function fetchRouteGeometry(waypoints) {
  const coordParam = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(';');
  const url = `${OSRM_FOOT_URL}/${coordParam}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM 요청 실패: ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error(`OSRM 경로 없음: ${data.code}`);
  return data.routes[0];
}

function haversineM(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// 공원 내부 보행로가 OSM 라우팅 그래프에 제대로 연결되어 있지 않은 경우(OSRM이 공원 밖 큰길로
// 우회해버림), 실제 도로를 따르는 정밀함은 포기하고 경유점을 직선으로 이어 공원 경계 안에 머무는
// 것을 우선한다.
function straightLineGeometry(waypoints) {
  let distance = 0;
  for (let i = 1; i < waypoints.length; i++) distance += haversineM(waypoints[i - 1], waypoints[i]);
  return {
    geometry: { type: 'LineString', coordinates: waypoints.map((wp) => [wp.lng, wp.lat]) },
    distance
  };
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
      `SELECT course_id, course_name, distance_m FROM course.courses WHERE course_id = ANY($1) ORDER BY course_id`,
      [TARGET_COURSE_IDS]
    );

    for (const course of courses) {
      const { rows: startRows } = await client.query(
        `SELECT sequence_no, latitude, longitude FROM course.course_waypoints
          WHERE course_id = $1 AND waypoint_type = 'START'
          ORDER BY sequence_no LIMIT 1`,
        [course.course_id]
      );
      const start = { lat: Number(startRows[0].latitude), lng: Number(startRows[0].longitude) };

      const park = await findEnclosingParkPolygon(start.lat, start.lng);
      if (!park) {
        console.error(`[${course.course_id}] 공원 폴리곤을 찾지 못해 건너뜀`);
        continue;
      }
      console.log(`[${course.course_id}] ${course.course_name}: 공원 "${park.name}" 경계(${park.polygon.length}개 점) 사용`);

      const synthesized = synthesizeLoopWithinPolygon(course, start, park.polygon);

      await client.query(
        `DELETE FROM course.course_waypoints WHERE course_id = $1 AND sequence_no > $2`,
        [course.course_id, startRows[0].sequence_no]
      );

      let nextSeq = startRows[0].sequence_no + 1;
      const waypoints = [{ ...start }];
      for (const item of synthesized) {
        await client.query(
          `INSERT INTO course.course_waypoints
             (course_id, sequence_no, waypoint_type, point_name, latitude, longitude, location)
           VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, ST_SetSRID(ST_MakePoint($7::float8, $8::float8), 4326))`,
          [course.course_id, nextSeq, item.type, item.name, item.point.lat, item.point.lng, item.point.lng, item.point.lat]
        );
        waypoints.push({ lat: item.point.lat, lng: item.point.lng });
        nextSeq += 1;
      }

      const outOfPark = waypoints.filter((wp) => !pointInPolygon(wp.lat, wp.lng, park.polygon));
      console.log(`[${course.course_id}] 새 웨이포인트 ${waypoints.length}개 중 공원 밖: ${outOfPark.length}개`);

      const osrmRoute = await fetchRouteGeometry(waypoints);
      const osrmOutsideRatio =
        osrmRoute.geometry.coordinates.filter(([lng, lat]) => !pointInPolygon(lat, lng, park.polygon)).length /
        osrmRoute.geometry.coordinates.length;
      console.log(
        `[${course.course_id}] OSRM 경로 점 ${osrmRoute.geometry.coordinates.length}개 중 공원 밖: ` +
          `${(osrmOutsideRatio * 100).toFixed(1)}%`
      );

      // OSRM이 공원 내부 보행로 연결이 부실해 바깥 큰길로 우회하면(5% 초과) 정밀도를 포기하고
      // 경유점을 직선으로 이어 공원 경계 안에 확실히 머무르게 한다.
      const useStraightLine = osrmOutsideRatio > 0.05;
      const { geometry, distance } = useStraightLine ? straightLineGeometry(waypoints) : osrmRoute;
      const newDistanceM = Math.round(distance);
      if (useStraightLine) {
        console.log(`[${course.course_id}] OSRM 우회가 심해 직선 경유점 경로로 대체`);
      }

      await client.query(
        `UPDATE course.courses
            SET route_geom = ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), distance_m = $3, updated_at = now()
          WHERE course_id = $1`,
        [course.course_id, JSON.stringify(geometry), newDistanceM]
      );
      console.log(`[${course.course_id}] 저장 완료: distance_m ${course.distance_m} -> ${newDistanceM}`);

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
