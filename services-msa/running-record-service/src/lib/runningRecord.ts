import { getPool } from './db.js';

export type RunningSummary = {
  totalDistanceM: number;
  totalDurationSec: number;
  totalMovingDurationSec: number;
  averagePaceSecPerKm: number | null;
  bestPaceSecPerKm: number | null;
  totalCalories: number;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averageCadence: number | null;
  totalElevationGainM: number;
  runCount: number;
};

// 최근 4주(seed 데이터 범위와 맞춤) 완료된 러닝 기록을 합산한다. running_record.runs에 있는
// 정보를 가능한 한 많이 보여주기 위해 심박수/케이던스/상승고도/최고 페이스까지 같이 집계한다.
// userId는 NextAuth 세션의 user.id — auth_user.users.user_id(UUID)를 그대로 쓴다.
export async function getRunningSummary(userId: string): Promise<RunningSummary | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    total_distance_m: string | null;
    total_duration_sec: string | null;
    total_moving_duration_sec: string | null;
    total_calories: string | null;
    avg_heart_rate: string | null;
    max_heart_rate: number | null;
    avg_cadence: string | null;
    total_elevation_gain_m: string | null;
    best_pace_sec_per_km: number | null;
    run_count: string;
  }>(
    `SELECT
       SUM(distance_m) AS total_distance_m,
       SUM(duration_sec) AS total_duration_sec,
       SUM(moving_duration_sec) AS total_moving_duration_sec,
       SUM(calories_kcal) AS total_calories,
       AVG(average_heart_rate) AS avg_heart_rate,
       MAX(max_heart_rate) AS max_heart_rate,
       AVG(average_cadence) AS avg_cadence,
       SUM(elevation_gain_m) AS total_elevation_gain_m,
       MIN(best_pace_sec_per_km) AS best_pace_sec_per_km,
       COUNT(*) AS run_count
     FROM running_record.runs
     WHERE user_id = $1 AND status = 'COMPLETED' AND started_at >= now() - interval '28 days'`,
    [userId]
  );

  const row = rows[0];
  const runCount = Number(row?.run_count ?? 0);
  if (runCount === 0) return null;

  const totalDistanceM = Number(row.total_distance_m ?? 0);
  const totalDurationSec = Number(row.total_duration_sec ?? 0);

  return {
    totalDistanceM,
    totalDurationSec,
    totalMovingDurationSec: Number(row.total_moving_duration_sec ?? 0),
    averagePaceSecPerKm: totalDistanceM > 0 ? Math.round((totalDurationSec / totalDistanceM) * 1000) : null,
    bestPaceSecPerKm: row.best_pace_sec_per_km ?? null,
    totalCalories: Number(row.total_calories ?? 0),
    averageHeartRate: row.avg_heart_rate ? Math.round(Number(row.avg_heart_rate)) : null,
    maxHeartRate: row.max_heart_rate ?? null,
    averageCadence: row.avg_cadence ? Math.round(Number(row.avg_cadence)) : null,
    totalElevationGainM: Number(row.total_elevation_gain_m ?? 0),
    runCount
  };
}

export type DailyDistancePoint = { dayLabel: string; distanceKm: number; isToday: boolean };

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// pg는 DATE 컬럼을 문자열이 아니라 JS Date 객체로 돌려준다 — 이 Date는 UTC 자정 기준으로
// 만들어지므로 toISOString().slice(0,10)으로 그대로 날짜 문자열을 복원할 수 있다.
function toDateStr(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

// 이번 주(월요일 시작, KST)를 월/화/수/목/금/토/일 7개로 나눠 하루 합산 거리를 계산한다.
// running_record.runs에 새 완료 기록이 생기면(오늘 뛰고 나면) 다음 조회 때 그 날짜의 막대에
// 바로 반영된다 — 별도 배치나 캐시 없이 그때그때 실시간으로 집계하는 쿼리라서 그렇다.
export async function getThisWeekDailyDistances(userId: string): Promise<DailyDistancePoint[]> {
  const pool = getPool();
  const todayKst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const isoDow = new Date(`${todayKst}T00:00:00Z`).getUTCDay() || 7; // 1=월 ... 7=일(getUTCDay는 0=일)
  const mondayStr = addDaysStr(todayKst, -(isoDow - 1));

  const { rows } = await pool.query<{ day: string | Date; distance_m: string | null }>(
    `SELECT (started_at AT TIME ZONE 'Asia/Seoul')::date AS day, SUM(distance_m) AS distance_m
       FROM running_record.runs
      WHERE user_id = $1 AND status = 'COMPLETED'
        AND (started_at AT TIME ZONE 'Asia/Seoul')::date >= $2::date
        AND (started_at AT TIME ZONE 'Asia/Seoul')::date < $2::date + 7
      GROUP BY day`,
    [userId, mondayStr]
  );

  const byDay = new Map(rows.map((r) => [toDateStr(r.day), Number(r.distance_m ?? 0)]));

  return DAY_LABELS.map((dayLabel, i) => {
    const dateStr = addDaysStr(mondayStr, i);
    return { dayLabel, distanceKm: (byDay.get(dateStr) ?? 0) / 1000, isToday: dateStr === todayKst };
  });
}

export type StatPeriod = 'year' | 'month' | 'week';
export type StatBucket = { label: string; distanceKm: number; avgHeartRate: number | null; isCurrent: boolean };
export type RunningStatsResult = { period: StatPeriod; buckets: StatBucket[]; hasAnyHeartRate: boolean };

// 마이페이지 통계 카드용. period에 따라 그래프 눈금이 달라진다:
//   year  -> 올해 1~12월, 달마다 합산 거리
//   month -> 이번 달의 주차별(1~5주차) 합산 거리
//   week  -> 이번 주 월~일 하루하루 합산 거리
// 심박수는 구간에 실제 기록이 하나라도 있을 때만 avgHeartRate를 채우고, hasAnyHeartRate로
// 프론트에서 "심박수 기록이 아직 없어요" 안내와 실제 차트를 가를 수 있게 한다.
export async function getRunningStatsByPeriod(userId: string, period: StatPeriod): Promise<RunningStatsResult> {
  const pool = getPool();
  const todayKst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const [yearStr, monthStr] = todayKst.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (period === 'year') {
    const { rows } = await pool.query<{ month: number; distance_m: string | null; avg_hr: string | null; hr_count: string }>(
      `SELECT EXTRACT(MONTH FROM (started_at AT TIME ZONE 'Asia/Seoul'))::int AS month,
              SUM(distance_m) AS distance_m, AVG(average_heart_rate) AS avg_hr, COUNT(average_heart_rate) AS hr_count
         FROM running_record.runs
        WHERE user_id = $1 AND status = 'COMPLETED'
          AND EXTRACT(YEAR FROM (started_at AT TIME ZONE 'Asia/Seoul')) = $2
        GROUP BY month`,
      [userId, year]
    );
    const byMonth = new Map(rows.map((r) => [r.month, r]));
    let hasAnyHeartRate = false;
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const row = byMonth.get(m);
      const hrCount = row ? Number(row.hr_count) : 0;
      if (hrCount > 0) hasAnyHeartRate = true;
      return {
        label: `${m}월`,
        distanceKm: row ? Number(row.distance_m ?? 0) / 1000 : 0,
        avgHeartRate: hrCount > 0 ? Math.round(Number(row!.avg_hr)) : null,
        isCurrent: m === month
      };
    });
    return { period, buckets, hasAnyHeartRate };
  }

  if (period === 'month') {
    const daysInMonth = new Date(year, month, 0).getDate();
    const weekCount = Math.ceil(daysInMonth / 7);
    const { rows } = await pool.query<{ week_index: number; distance_m: string | null; avg_hr: string | null; hr_count: string }>(
      `SELECT CEIL(EXTRACT(DAY FROM (started_at AT TIME ZONE 'Asia/Seoul'))::numeric / 7)::int AS week_index,
              SUM(distance_m) AS distance_m, AVG(average_heart_rate) AS avg_hr, COUNT(average_heart_rate) AS hr_count
         FROM running_record.runs
        WHERE user_id = $1 AND status = 'COMPLETED'
          AND EXTRACT(YEAR FROM (started_at AT TIME ZONE 'Asia/Seoul')) = $2
          AND EXTRACT(MONTH FROM (started_at AT TIME ZONE 'Asia/Seoul')) = $3
        GROUP BY week_index`,
      [userId, year, month]
    );
    const byWeek = new Map(rows.map((r) => [r.week_index, r]));
    const currentWeekIndex = Math.ceil(Number(todayKst.slice(8, 10)) / 7);
    let hasAnyHeartRate = false;
    const buckets = Array.from({ length: weekCount }, (_, i) => {
      const w = i + 1;
      const row = byWeek.get(w);
      const hrCount = row ? Number(row.hr_count) : 0;
      if (hrCount > 0) hasAnyHeartRate = true;
      return {
        label: `${w}주차`,
        distanceKm: row ? Number(row.distance_m ?? 0) / 1000 : 0,
        avgHeartRate: hrCount > 0 ? Math.round(Number(row!.avg_hr)) : null,
        isCurrent: w === currentWeekIndex
      };
    });
    return { period, buckets, hasAnyHeartRate };
  }

  // week: 이번 주 월~일
  const isoDow = new Date(`${todayKst}T00:00:00Z`).getUTCDay() || 7;
  const mondayStr = addDaysStr(todayKst, -(isoDow - 1));
  const { rows } = await pool.query<{ day: string | Date; distance_m: string | null; avg_hr: string | null; hr_count: string }>(
    `SELECT (started_at AT TIME ZONE 'Asia/Seoul')::date AS day,
            SUM(distance_m) AS distance_m, AVG(average_heart_rate) AS avg_hr, COUNT(average_heart_rate) AS hr_count
       FROM running_record.runs
      WHERE user_id = $1 AND status = 'COMPLETED'
        AND (started_at AT TIME ZONE 'Asia/Seoul')::date >= $2::date
        AND (started_at AT TIME ZONE 'Asia/Seoul')::date < $2::date + 7
      GROUP BY day`,
    [userId, mondayStr]
  );
  const byDay = new Map(rows.map((r) => [toDateStr(r.day), r]));
  let hasAnyHeartRate = false;
  const buckets = DAY_LABELS.map((dayLabel, i) => {
    const dateStr = addDaysStr(mondayStr, i);
    const row = byDay.get(dateStr);
    const hrCount = row ? Number(row.hr_count) : 0;
    if (hrCount > 0) hasAnyHeartRate = true;
    return {
      label: dayLabel,
      distanceKm: row ? Number(row.distance_m ?? 0) / 1000 : 0,
      avgHeartRate: hrCount > 0 ? Math.round(Number(row!.avg_hr)) : null,
      isCurrent: dateStr === todayKst
    };
  });
  return { period, buckets, hasAnyHeartRate };
}

// 오늘까지 매일 최소 1회 완료한 러닝이 있는 연속 일수. 오늘 아직 안 뛰었으면 0을 반환한다
// ("오늘 뛴다면 연속 며칠째인지" — 오늘 기록이 없으면 연속 기록은 끊긴 것으로 본다).
export async function getCurrentRunStreak(userId: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ day: string | Date }>(
    `SELECT DISTINCT (started_at AT TIME ZONE 'Asia/Seoul')::date AS day
       FROM running_record.runs
      WHERE user_id = $1 AND status = 'COMPLETED'
      ORDER BY day DESC
      LIMIT 400`,
    [userId]
  );
  const daySet = new Set(rows.map((r) => toDateStr(r.day)));
  const todayKst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  if (!daySet.has(todayKst)) return 0;

  let streak = 0;
  let cursor = todayKst;
  while (daySet.has(cursor)) {
    streak += 1;
    cursor = addDaysStr(cursor, -1);
  }
  return streak;
}

export type DetailedRun = {
  runId: string;
  startedAt: string;
  distanceM: number;
  durationSec: number;
  averagePaceSecPerKm: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  calories: number | null;
  elevationGainM: number | null;
  sourceType: string;
  courseId: string | null;
  courseName: string | null;
};

// 마이페이지 "최근 러닝 기록" 표. course_id가 있으면 코스명을 같이 붙여서(코스 상세보기 링크용) 준다.
// GPS 트래킹 중간에 멈춘(STOPPED) 기록도 실제 뛴 거리가 있으면 의미 있는 기록이라 같이 보여준다
// (0m짜리는 애초에 저장 단계에서 걸러진다 — lib/runTracking.ts의 finishRun 참고).
export async function getRecentRunsDetailed(userId: string, limit = 20): Promise<DetailedRun[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT r.run_id, r.started_at, r.distance_m, r.duration_sec, r.average_pace_sec_per_km,
            r.average_heart_rate, r.max_heart_rate, r.calories_kcal, r.elevation_gain_m, r.source_type,
            r.course_id, c.course_name
       FROM running_record.runs r
       LEFT JOIN course.courses c ON c.course_id = r.course_id
      WHERE r.user_id = $1 AND r.status IN ('COMPLETED', 'STOPPED') AND r.distance_m > 0
      ORDER BY r.started_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map((row) => ({
    runId: row.run_id,
    startedAt: row.started_at,
    distanceM: row.distance_m,
    durationSec: row.duration_sec,
    averagePaceSecPerKm: row.average_pace_sec_per_km,
    averageHeartRate: row.average_heart_rate,
    maxHeartRate: row.max_heart_rate,
    calories: row.calories_kcal,
    elevationGainM: row.elevation_gain_m,
    sourceType: row.source_type,
    courseId: row.course_id,
    courseName: row.course_name
  }));
}

export type RunRouteForRecommendation = {
  distanceM: number;
  positions: [number, number][];
};

// "이 러닝을 코스로 추천하기" 기능용. Course 서비스가 이 서비스 소유 데이터(러닝 경로)를 직접
// 조회하지 않고 이 엔드포인트를 통해서만 받아가게 한다(course.courses를 여기서 직접 만들지 않는다 —
// 코스 생성 자체는 Course 서비스 책임). 본인 소유의 완료된(COMPLETED/STOPPED) 기록만, 실제 경로
// 포인트가 2개 이상 있어야(직선이라도 유효한 LineString) 코스로 추천할 수 있다.
export async function getRunRouteForRecommendation(runId: string, userId: string): Promise<RunRouteForRecommendation | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT distance_m, ST_AsGeoJSON(route_geom) AS route_geojson
       FROM running_record.runs
      WHERE run_id = $1 AND user_id = $2 AND status IN ('COMPLETED', 'STOPPED') AND distance_m > 0`,
    [runId, userId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const geojson = row.route_geojson ? JSON.parse(row.route_geojson) : null;
  const positions: [number, number][] = (geojson?.coordinates ?? []).map(([lng, lat]: [number, number]) => [lat, lng]);
  if (positions.length < 2) return null;
  return { distanceM: row.distance_m, positions };
}

export function formatDuration(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatPace(paceSecPerKm: number) {
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}
