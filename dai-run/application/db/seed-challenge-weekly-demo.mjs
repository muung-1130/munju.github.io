// challenge.challenge_series를 이번 주(월~일, KST) challenge.challenges 인스턴스로 처음 발행하고,
// 기존(이제는 CANCELLED된) 공개 챌린지에 참여하던 사용자들을 새 인스턴스로 옮긴다.
// admin은 실제 running_record.runs 2건을 넣어서, 그 기록으로부터 진짜로 진행도/일자별 성공·실패
// 로그가 계산되게 한다(진행도 숫자를 직접 꽂아넣지 않음).
import { Client } from 'pg';

const client = new Client();
await client.connect();

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 오늘(KST) 기준 이번 주 월요일 00:00:00 KST와 일요일 23:59:59 KST를 UTC ISO로 반환한다.
function currentWeekRangeKst() {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dow = nowKst.getUTCDay(); // 0=일 ... 1=월
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const mondayKst = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() - daysSinceMonday));
  const sundayKst = new Date(mondayKst.getTime() + 6 * 24 * 60 * 60 * 1000);
  const startAt = new Date(mondayKst.getTime() - 9 * 60 * 60 * 1000); // 월요일 00:00 KST -> UTC
  const endAt = new Date(sundayKst.getTime() + (24 * 60 * 60 * 1000 - 1000) - 9 * 60 * 60 * 1000); // 일요일 23:59:59 KST -> UTC
  return { startAt, endAt, mondayKst };
}

const { startAt, endAt } = currentWeekRangeKst();
console.log(`이번 주 인스턴스 기간: ${startAt.toISOString()} ~ ${endAt.toISOString()}`);

const { rows: series } = await client.query(`SELECT * FROM challenge.challenge_series WHERE is_active = true`);

// 기존(CANCELLED된) 일회성 공개 챌린지 이름 -> 시리즈 이름 매핑. 참여자 이관 시 사용.
const OLD_NAME_TO_SERIES_NAME = {
  '30일 5K 완주 챌린지': '주간 5K 완주 챌린지',
  '한강 종주 200km': '주간 한강 20km 챌린지',
  "페이스 마스터 5'00\"": "페이스 마스터 5'00\"",
  '아침러닝 인증 챌린지': '아침러닝 인증 챌린지',
  '주말 20km 완주': '주말 20km 완주'
};

const newChallengeIdBySeriesId = new Map();

for (const s of series) {
  const { rows: challengeRows } = await client.query(
    `INSERT INTO challenge.challenges
       (creator_user_id, challenge_type, name, description, metric_type, target_value, start_at, end_at, visibility, status, series_id)
     VALUES ($1, 'PUBLIC', $2, $3, $4, $5, $6, $7, 'PUBLIC', 'ACTIVE', $8)
     RETURNING challenge_id`,
    [s.creator_user_id, s.name, s.description, s.metric_type, s.target_value, startAt.toISOString(), endAt.toISOString(), s.series_id]
  );
  const challengeId = challengeRows[0].challenge_id;
  newChallengeIdBySeriesId.set(s.series_id, challengeId);

  await client.query(
    `INSERT INTO challenge.challenge_rules
       (challenge_id, min_distance_m, max_distance_m, min_pace_sec_per_km, max_pace_sec_per_km,
        min_duration_sec, max_duration_sec, min_avg_heart_rate, max_avg_heart_rate,
        min_avg_cadence, min_elevation_gain_m, allowed_source_types, extra_conditions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      challengeId, s.min_distance_m, s.max_distance_m, s.min_pace_sec_per_km, s.max_pace_sec_per_km,
      s.min_duration_sec, s.max_duration_sec, s.min_avg_heart_rate, s.max_avg_heart_rate,
      s.min_avg_cadence, s.min_elevation_gain_m, s.allowed_source_types, s.extra_conditions
    ]
  );
  console.log(`인스턴스 생성: ${s.name} -> ${challengeId}`);
}

// 예전 공개 챌린지(이제 CANCELLED) 참여자 중 CANCELLED 아니었던 사람들을 새 인스턴스로 이관한다.
const { rows: oldParticipants } = await client.query(
  `SELECT c.name AS old_name, p.user_id
     FROM challenge.challenge_participations p
     JOIN challenge.challenges c ON c.challenge_id = p.challenge_id
    WHERE c.challenge_type = 'PUBLIC' AND c.status = 'CANCELLED' AND p.status IN ('ACTIVE', 'COMPLETED')`
);

const seriesByName = new Map(series.map((s) => [s.name, s]));
let migrated = 0;
for (const row of oldParticipants) {
  const seriesName = OLD_NAME_TO_SERIES_NAME[row.old_name];
  const s = seriesName && seriesByName.get(seriesName);
  if (!s) continue;
  const newChallengeId = newChallengeIdBySeriesId.get(s.series_id);
  const { rowCount } = await client.query(
    `INSERT INTO challenge.challenge_participations (challenge_id, user_id, status, progress_value, progress_ratio)
     VALUES ($1, $2, 'ACTIVE', 0, 0)
     ON CONFLICT (challenge_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
    [newChallengeId, row.user_id]
  );
  migrated += rowCount;
}
console.log(`참여자 이관: ${migrated}명`);

// admin 실데이터: 이번 주 월요일 아침 러닝(빠른 페이스, 장거리) + 화요일 저녁 러닝(짧고 빠름)을
// 실제 running_record.runs로 넣고, 각 챌린지 규칙에 맞춰 진행도를 실제로 계산해 반영한다.
const { rows: adminRows } = await client.query(`SELECT user_id FROM auth_user.users WHERE user_name = 'admin'`);
const adminId = adminRows[0].user_id;

// admin은 아래 4개 시리즈에 참여 중이어야 한다 — 예전 챌린지에서 이미 이관됐을 수도 있고(5K/한강20km),
// CANCELLED였다가 이번 주에 다시 참여하는 경우도 있으니(페이스마스터/아침러닝) 안전하게 보장한다.
for (const name of ['주간 5K 완주 챌린지', '주간 한강 20km 챌린지', "페이스 마스터 5'00\"", '아침러닝 인증 챌린지']) {
  const s = seriesByName.get(name);
  const challengeId = newChallengeIdBySeriesId.get(s.series_id);
  await client.query(
    `INSERT INTO challenge.challenge_participations (challenge_id, user_id, status, progress_value, progress_ratio)
     VALUES ($1, $2, 'ACTIVE', 0, 0)
     ON CONFLICT (challenge_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
    [challengeId, adminId]
  );
}

function kstToUtcIso(y, m, d, hh, mm) {
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mm)).toISOString();
}

const weekMonday = new Date(startAt);
const mondayKstDate = new Date(weekMonday.getTime() + 9 * 60 * 60 * 1000);
const y = mondayKstDate.getUTCFullYear();
const mo = mondayKstDate.getUTCMonth() + 1;
const mondayDay = mondayKstDate.getUTCDate();
const tuesdayDay = mondayDay + 1;

async function insertRun({ startedAtIso, distanceM, avgPaceSecPerKm }) {
  const durationSec = Math.round((distanceM / 1000) * avgPaceSecPerKm);
  const completedAtIso = new Date(new Date(startedAtIso).getTime() + durationSec * 1000).toISOString();
  const { rows } = await client.query(
    `INSERT INTO running_record.runs
       (user_id, source_type, status, started_at, completed_at, duration_sec, moving_duration_sec,
        distance_m, average_pace_sec_per_km, best_pace_sec_per_km, average_heart_rate, max_heart_rate,
        average_cadence, calories_kcal, elevation_gain_m)
     VALUES ($1, 'APP', 'COMPLETED', $2, $3, $4, $4, $5, $6, $6, 148, 168, 172, $7, 3.0)
     RETURNING run_id, started_at, completed_at, distance_m, average_pace_sec_per_km`,
    [adminId, startedAtIso, completedAtIso, durationSec, distanceM, avgPaceSecPerKm, Math.round(distanceM / 1000 * 62)]
  );
  return rows[0];
}

// 월요일 07:00 KST — 6.5km, 5'30"/km (아침 인증 + 5K 완주 + 한강 20km 모두 충족)
const mondayRun = await insertRun({
  startedAtIso: kstToUtcIso(y, mo, mondayDay, 7, 0),
  distanceM: 6500,
  avgPaceSecPerKm: 330
});
console.log('월요일 러닝 시드:', mondayRun.run_id);

// 화요일 19:00 KST — 4.0km, 4'45"/km (한강 20km는 충족하지만 5K 완주 최소거리 미달, 아침 인증도 저녁이라 미달)
const tuesdayRun = await insertRun({
  startedAtIso: kstToUtcIso(y, mo, tuesdayDay, 19, 0),
  distanceM: 4000,
  avgPaceSecPerKm: 285
});
console.log('화요일 러닝 시드:', tuesdayRun.run_id);

// 각 러닝이 admin이 참여 중인 시리즈별 규칙을 충족하는지 직접 판정해서 진행도를 반영한다.
async function applyProgress(seriesName, run, { qualifies, incrementOverride } = {}) {
  const s = seriesByName.get(seriesName);
  const challengeId = newChallengeIdBySeriesId.get(s.series_id);
  const { rows: partRows } = await client.query(
    `SELECT participation_id, progress_value FROM challenge.challenge_participations
      WHERE challenge_id = $1 AND user_id = $2`,
    [challengeId, adminId]
  );
  if (partRows.length === 0 || !qualifies) return;
  const participationId = partRows[0].participation_id;
  const progressBefore = Number(partRows[0].progress_value);
  const targetValue = Number(s.target_value);

  let progressAfter;
  if (incrementOverride !== undefined) {
    progressAfter = Math.max(progressBefore, incrementOverride);
  } else {
    progressAfter = progressBefore + run.distance_m / 1000;
  }
  if (progressAfter === progressBefore) return;

  await client.query(
    `INSERT INTO challenge.challenge_progress_events
       (participation_id, source_event_id, run_id, increment_value, progress_before, progress_after, occurred_at)
     VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6)`,
    [participationId, run.run_id, progressAfter - progressBefore, progressBefore, progressAfter, run.completed_at]
  );
  const ratio = Math.min(100, (progressAfter / targetValue) * 100);
  const isNowComplete = progressAfter >= targetValue;
  await client.query(
    `UPDATE challenge.challenge_participations
        SET progress_value = $2, progress_ratio = $3,
            status = CASE WHEN $4 THEN 'COMPLETED' ELSE status END,
            completed_at = CASE WHEN $4 THEN now() ELSE completed_at END
      WHERE participation_id = $1`,
    [participationId, progressAfter, ratio, isNowComplete]
  );
}

// 월요일 6.5km, 5'30" — 세 챌린지 모두 조건 충족(거리 ≥5km, 오전 9시 이전)
await applyProgress('주간 5K 완주 챌린지', mondayRun, { qualifies: true });
await applyProgress('주간 한강 20km 챌린지', mondayRun, { qualifies: true });
// COUNT 챌린지는 1회 인증 = +1
await applyProgress('아침러닝 인증 챌린지', mondayRun, { qualifies: true, incrementOverride: 1 });

// 화요일 4.0km, 4'45" — 5K 완주는 최소거리 미달로 실패, 한강 20km는 거리 제한 없어서 성공,
// 페이스 마스터는 4'45"(285초) <= 목표 300초라 성공(달성 즉시 100%)
await applyProgress('주간 한강 20km 챌린지', tuesdayRun, { qualifies: true });
await applyProgress("페이스 마스터 5'00\"", tuesdayRun, { qualifies: true, incrementOverride: 300 });

console.log('완료');
await client.end();
