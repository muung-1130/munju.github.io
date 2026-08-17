// 공개 챌린지 "매주 월~일 자동 반복" 배치. challenge.challenge_series는 반복 템플릿만 들고 있고,
// 실제로 화면에 노출/참여되는 건 challenge.challenges의 개별 주차 row다(lib/challenges.ts와 동일한
// series/instance 모델 — db/035_challenge_weekly_series.sql 참고).
//
// 매일 KST 자정에 한 번씩:
//   - 월요일: 지난주 인스턴스의 ACTIVE 참여를 진행률 기준으로 COMPLETED/FAILED로 확정하고, 지난주
//     인스턴스를 COMPLETED 처리한 뒤, 시리즈 템플릿으로 이번 주 새 인스턴스(+challenge_rules)를
//     만들고, 지난주 참여자(CANCELLED 제외)를 새 인스턴스의 ACTIVE 참여로 이관한다. 이관된 사람 중
//     지난주에 WAITING이었던 사람에게는 "오늘부터 시작" 알림을 보낸다.
//   - 매일: 다음 날이 월요일이면(=오늘이 일요일) 현재 WAITING 상태로 대기 중인 참여자에게
//     "내일부터 시작" 알림을 보낸다.
import './otel.mjs';
import { Pool } from 'pg';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function msUntilNextKstMidnight() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const kstMidnight = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + 1, 0, 0, 0));
  const nextMidnightUtc = kstMidnight.getTime() - KST_OFFSET_MS;
  return nextMidnightUtc - now.getTime();
}

function kstWeekday() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' });
}

function isMondayKst() {
  return kstWeekday() === 'Mon';
}

function isSundayKst() {
  return kstWeekday() === 'Sun';
}

// lib/challenges.ts의 currentOrNextMondayRangeKst()/mondayRangeKst()와 동일한 계산 — 이 배치는
// 오직 "오늘이 월요일"인 경우에만 이 함수를 쓰므로 항상 "이번 주(=오늘) 월~일"만 계산한다.
function thisMondayRangeKst() {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const mondayKstMidnight = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()));
  const startAt = new Date(mondayKstMidnight.getTime() - KST_OFFSET_MS).toISOString();
  const endAt = new Date(
    mondayKstMidnight.getTime() + 6 * 24 * 60 * 60 * 1000 + (24 * 60 * 60 * 1000 - 1000) - KST_OFFSET_MS
  ).toISOString();
  return { startAt, endAt };
}

const RULE_COLUMNS = [
  'min_distance_m',
  'max_distance_m',
  'min_pace_sec_per_km',
  'max_pace_sec_per_km',
  'min_duration_sec',
  'max_duration_sec',
  'min_avg_heart_rate',
  'max_avg_heart_rate',
  'min_avg_cadence',
  'min_elevation_gain_m',
  'allowed_source_types',
  'start_time_of_day',
  'end_time_of_day',
  'extra_conditions'
];

async function insertNotificationOncePerDay(pg, { userId, notificationType, title, body, targetUrl, referenceId }) {
  // 알림 Worker는 멱등이어야 한다(CLAUDE.md 7.3) — 스케줄러가 같은 날 두 번 돌아도(재시작 등)
  // 같은 유저/챌린지/알림 유형으로 중복 알림이 쌓이지 않게 당일 발송 여부를 먼저 확인한다.
  const { rows } = await pg.query(
    `SELECT 1 FROM notification.notifications
      WHERE user_id = $1 AND reference_type = 'CHALLENGE' AND reference_id = $2 AND notification_type = $3
        AND (created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date
      LIMIT 1`,
    [userId, referenceId, notificationType]
  );
  if (rows.length > 0) return;
  await pg.query(
    `INSERT INTO notification.notifications (user_id, notification_type, title, body, target_url, reference_type, reference_id)
     VALUES ($1, $2, $3, $4, $5, 'CHALLENGE', $6)`,
    [userId, notificationType, title, body, targetUrl, referenceId]
  );
}

async function rolloverSeries(pg, series) {
  const { rows: activeRows } = await pg.query(
    `SELECT challenge_id, start_at FROM challenge.challenges
      WHERE series_id = $1 AND status = 'ACTIVE'
      ORDER BY start_at DESC LIMIT 1`,
    [series.series_id]
  );
  const { startAt, endAt } = thisMondayRangeKst();
  const outgoing = activeRows[0];

  // 이미 이번 주 인스턴스가 만들어져 있으면(같은 날 재실행 등) 건너뛴다.
  if (outgoing && new Date(outgoing.start_at).toISOString() === startAt) return;

  await pg.query('BEGIN');
  try {
    if (outgoing) {
      await pg.query(
        `UPDATE challenge.challenge_participations
            SET status = CASE WHEN progress_ratio >= 100 THEN 'COMPLETED' ELSE 'FAILED' END
          WHERE challenge_id = $1 AND status = 'ACTIVE'`,
        [outgoing.challenge_id]
      );
      await pg.query(`UPDATE challenge.challenges SET status = 'COMPLETED' WHERE challenge_id = $1`, [outgoing.challenge_id]);
    }

    const { rows: newRows } = await pg.query(
      `INSERT INTO challenge.challenges
         (creator_user_id, challenge_type, name, description, metric_type, target_value, start_at, end_at, visibility, status, series_id)
       VALUES ($1, 'PUBLIC', $2, $3, $4, $5, $6, $7, 'PUBLIC', 'ACTIVE', $8)
       RETURNING challenge_id`,
      [series.creator_user_id, series.name, series.description, series.metric_type, series.target_value, startAt, endAt, series.series_id]
    );
    const newChallengeId = newRows[0].challenge_id;

    const hasRules = RULE_COLUMNS.some((col) => series[col] !== null && series[col] !== undefined);
    if (hasRules) {
      const values = RULE_COLUMNS.map((col) => series[col]);
      await pg.query(
        `INSERT INTO challenge.challenge_rules (challenge_id, ${RULE_COLUMNS.join(', ')})
         VALUES ($1, ${RULE_COLUMNS.map((_, i) => `$${i + 2}`).join(', ')})`,
        [newChallengeId, ...values]
      );
    }

    let migratedFromWaiting = [];
    if (outgoing) {
      await pg.query(
        `INSERT INTO challenge.challenge_participations (challenge_id, user_id, status, progress_value, progress_ratio)
         SELECT $1, user_id, 'ACTIVE', 0, 0
           FROM challenge.challenge_participations
          WHERE challenge_id = $2 AND status IN ('COMPLETED', 'FAILED')
         ON CONFLICT (challenge_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
        [newChallengeId, outgoing.challenge_id]
      );

      const { rows: waitingRows } = await pg.query(
        `INSERT INTO challenge.challenge_participations (challenge_id, user_id, status, progress_value, progress_ratio)
         SELECT $1, user_id, 'ACTIVE', 0, 0
           FROM challenge.challenge_participations
          WHERE challenge_id = $2 AND status = 'WAITING'
         ON CONFLICT (challenge_id, user_id) WHERE user_id IS NOT NULL DO NOTHING
         RETURNING user_id`,
        [newChallengeId, outgoing.challenge_id]
      );
      migratedFromWaiting = waitingRows.map((r) => r.user_id);
    }

    await pg.query('COMMIT');
    return { newChallengeId, migratedFromWaiting };
  } catch (err) {
    await pg.query('ROLLBACK');
    throw err;
  }
}

async function runMondayRollover(pg) {
  const { rows: seriesRows } = await pg.query(`SELECT * FROM challenge.challenge_series WHERE is_active = true`);
  for (const series of seriesRows) {
    try {
      const result = await rolloverSeries(pg, series);
      if (!result) continue;
      for (const userId of result.migratedFromWaiting) {
        await insertNotificationOncePerDay(pg, {
          userId,
          notificationType: 'CHALLENGE_STARTED',
          title: '챌린지가 시작됐어요',
          body: `'${series.name}' 챌린지가 오늘부터 이번 주 시작이에요. 화이팅!`,
          targetUrl: `/challenges/${result.newChallengeId}`,
          referenceId: result.newChallengeId
        });
      }
      console.log(`[challenge-weekly-scheduler] rolled over series ${series.series_id} (${series.name})`);
    } catch (err) {
      // 한 시리즈의 롤오버 실패가 나머지 시리즈 처리를 막지 않게 개별로 격리한다.
      console.error(`[challenge-weekly-scheduler] rollover failed for series ${series.series_id}:`, err);
    }
  }
}

async function runWaitingReminders(pg) {
  const { rows } = await pg.query(
    `SELECT p.user_id, p.challenge_id, c.name
       FROM challenge.challenge_participations p
       JOIN challenge.challenges c ON c.challenge_id = p.challenge_id
      WHERE p.status = 'WAITING' AND c.status = 'ACTIVE'`
  );
  for (const row of rows) {
    try {
      await insertNotificationOncePerDay(pg, {
        userId: row.user_id,
        notificationType: 'CHALLENGE_STARTING_SOON',
        title: '내일 챌린지가 시작돼요',
        body: `'${row.name}' 챌린지가 내일(월요일)부터 시작돼요. 잊지 말고 참여해 보세요!`,
        targetUrl: `/challenges/${row.challenge_id}`,
        referenceId: row.challenge_id
      });
    } catch (err) {
      console.error(`[challenge-weekly-scheduler] reminder failed for user ${row.user_id}:`, err);
    }
  }
  console.log(`[challenge-weekly-scheduler] sent ${rows.length} starting-soon reminder(s) at ${new Date().toISOString()}`);
}

// 개인 챌린지는 "들어간 날부터 7일" 식으로 각자 다른 end_at을 갖고, 공개 챌린지처럼 매주
// 롤오버해주는 배치가 없다 — 러닝 기록이 들어올 때만(syncUserChallengeProgress) 기간 종료
// 여부를 확인하므로, 사용자가 마감일 이후로 더 뛰지 않으면 참가가 영원히 ACTIVE로 남아
// "완료한 챌린지"에도 안 뜨고 목록에서도 계속 진행 중처럼 보이는 문제가 있었다. 매일 자정에
// 기간이 지난 ACTIVE 참가를 전부 훑어서 진행률 기준으로 COMPLETED/FAILED로 확정한다.
async function finalizeExpiredChallenges(pg) {
  const { rowCount } = await pg.query(
    `UPDATE challenge.challenge_participations p
        SET status = CASE WHEN p.progress_ratio >= 100 THEN 'COMPLETED' ELSE 'FAILED' END,
            completed_at = CASE WHEN p.progress_ratio >= 100 THEN now() ELSE p.completed_at END
       FROM challenge.challenges c
      WHERE c.challenge_id = p.challenge_id AND p.status = 'ACTIVE' AND c.end_at < now()`
  );
  if (rowCount > 0) {
    console.log(`[challenge-weekly-scheduler] finalized ${rowCount} expired participation(s)`);
  }
}

async function runDailyTick(pg) {
  await finalizeExpiredChallenges(pg);
  if (isMondayKst()) await runMondayRollover(pg);
  if (isSundayKst()) await runWaitingReminders(pg);
}

async function main() {
  // 단일 Client를 다음 KST 자정까지(최대 24시간) 붙들고 있으면, 그 사이 네트워크 계층이
  // idle 커넥션을 리셋할 때(ECONNRESET) unhandled 'error' event로 프로세스 전체가 죽는다
  // (crew-notification-consumer/crew-stats-scheduler에서 실제로 반복 관측된 크래시와 동일
  // 패턴). Pool로 바꾸면 죽은 커넥션은 다음 쿼리 시점에 자동으로 새로 만들어 쓰므로 자체
  // 복구된다.
  const pg = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    keepAlive: true
  });
  pg.on('error', (err) => {
    console.error('[challenge-weekly-scheduler] idle client error', err);
  });
  console.log('[challenge-weekly-scheduler] postgres pool ready');

  // 컨테이너가 재시작돼도 오늘 처리해야 할 일(월요일 롤오버, 일요일 알림)이 누락되지 않도록 시작 시
  // 1회 즉시 실행하고, 이후로는 KST 자정마다 반복한다.
  await runDailyTick(pg).catch((err) => console.error('[challenge-weekly-scheduler] initial tick failed:', err));

  async function scheduleNext() {
    const delay = msUntilNextKstMidnight();
    console.log(`[challenge-weekly-scheduler] next tick in ${Math.round(delay / 60000)} min`);
    setTimeout(async () => {
      try {
        await runDailyTick(pg);
      } catch (err) {
        console.error('[challenge-weekly-scheduler] tick failed:', err);
      } finally {
        scheduleNext();
      }
    }, delay);
  }

  await scheduleNext();
}

main().catch((err) => {
  console.error('[challenge-weekly-scheduler] fatal error:', err);
  process.exit(1);
});
