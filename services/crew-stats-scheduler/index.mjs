// 크루 배틀을 하지 않는 크루도 "최근 7일 크루원 평균 km / 평균 페이스"를 크루 모집 목록과
// 채팅방 헤더에서 참고할 수 있게, crew.crews.avg_weekly_distance_m/avg_weekly_pace_sec_per_km를
// 매일 자정(KST)에 갱신해두는 배치 프로세스. Kafka 이벤트로 트리거되지 않는다 — 이 값은
// "그날그날 즉시 반영"이 필요한 값이 아니라 하루 단위 스냅샷이면 충분해서(크루/멤버 수가 늘어날수록
// 매 페이지 로드마다 전체를 다시 계산하면 무거워짐), 단순 스케줄러가 더 적합하다고 판단했다.
import { Client } from 'pg';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// "지금부터 다음 자정(KST)까지" 몇 ms 남았는지 계산한다. UTC 기준 시각에 KST 오프셋을 더해
// KST 벽시계 기준 자정을 구한 뒤, 다시 UTC로 환산해서 setTimeout에 넘긴다.
function msUntilNextKstMidnight() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const kstMidnight = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + 1, 0, 0, 0));
  const nextMidnightUtc = kstMidnight.getTime() - KST_OFFSET_MS;
  return nextMidnightUtc - now.getTime();
}

async function refreshAllCrewWeeklyStats(pg) {
  // 팀 평균 = 활성 멤버 전원을 분모로(안 뛴 멤버는 0으로 포함), 페이스 평균 = 실제로 뛴 멤버들의
  // 평균 페이스만(안 뛴 멤버는 제외) — lib/crewBattle.ts의 getCrewAvgKmForDate/getCrewAvgPaceForDate와
  // 같은 "팀 평균 km, 러너 평균 페이스" 원칙을 7일 창으로 확장한 것이다.
  const { rowCount } = await pg.query(
    `WITH window_runs AS (
       SELECT m.crew_id, m.user_id,
              SUM(r.distance_m) AS user_distance_m,
              AVG(r.average_pace_sec_per_km) AS user_avg_pace_sec_per_km
         FROM crew.crew_members m
         LEFT JOIN running_record.runs r
           ON r.user_id = m.user_id
          AND r.status = 'COMPLETED'
          AND (r.started_at AT TIME ZONE 'Asia/Seoul')::date
                BETWEEN (now() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '6 days'
                    AND (now() AT TIME ZONE 'Asia/Seoul')::date
        WHERE m.status = 'ACTIVE'
        GROUP BY m.crew_id, m.user_id
     ),
     crew_agg AS (
       SELECT crew_id,
              SUM(COALESCE(user_distance_m, 0)) AS total_distance_m,
              COUNT(*) AS member_count,
              AVG(user_avg_pace_sec_per_km) AS avg_pace_sec_per_km
         FROM window_runs
        GROUP BY crew_id
     )
     UPDATE crew.crews c
        SET avg_weekly_distance_m = ROUND(a.total_distance_m / NULLIF(a.member_count, 0)),
            avg_weekly_pace_sec_per_km = ROUND(a.avg_pace_sec_per_km),
            stats_updated_at = now()
       FROM crew_agg a
      WHERE c.crew_id = a.crew_id`
  );
  console.log(`[crew-stats-scheduler] refreshed ${rowCount} crew(s) at ${new Date().toISOString()}`);
}

async function main() {
  const pg = new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  });
  await pg.connect();
  console.log('[crew-stats-scheduler] postgres connected');

  // 컨테이너가 재시작될 때마다 값이 오래 비어있지 않도록 시작 시 1회 즉시 계산하고, 이후로는
  // KST 자정마다 반복한다.
  await refreshAllCrewWeeklyStats(pg).catch((err) => console.error('[crew-stats-scheduler] initial refresh failed:', err));

  async function scheduleNext() {
    const delay = msUntilNextKstMidnight();
    console.log(`[crew-stats-scheduler] next refresh in ${Math.round(delay / 60000)} min`);
    setTimeout(async () => {
      try {
        await refreshAllCrewWeeklyStats(pg);
      } catch (err) {
        console.error('[crew-stats-scheduler] refresh failed:', err);
      } finally {
        scheduleNext();
      }
    }, delay);
  }

  await scheduleNext();
}

main().catch((err) => {
  console.error('[crew-stats-scheduler] fatal error:', err);
  process.exit(1);
});
