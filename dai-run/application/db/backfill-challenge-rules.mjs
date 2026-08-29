// 일회성 백필: 지금 만들어져 있는 9개 챌린지에 challenge_rules 행을 하나씩 만든다.
// 대부분은 challenges.metric_type/target_value가 이미 "총 누적량"을 표현하고 있어서 별도
// per-run 조건이 필요 없다(전부 NULL인 빈 규칙 = "완료된 러닝은 다 인정"). 이름에서 명확히
// per-run 조건이 드러나는 경우만 채운다:
//   - "30일 5K 완주 챌린지" → 매 러닝이 5km는 넘어야 "완주"로 인정 (min_distance_m)
//   - "페이스 마스터 5'00"" → 그 페이스(5:00/km) 이하로 뛴 러닝만 인정 (max_pace_sec_per_km)
//   - "아침" 관련 2개 챌린지 → 몇 시 이전 시작이어야 "아침"인지는 임의로 정할 수 없어 오전 9시로
//     잠정 설정해두고 extra_conditions(jsonb)에 남긴다 — 팀에서 기준 시각을 다시 정하면 코드
//     배포 없이 이 값만 UPDATE하면 된다.
import { Client } from 'pg';

const client = new Client();
await client.connect();

const { rows: challenges } = await client.query(
  `SELECT challenge_id, name FROM challenge.challenges`
);

const RULES = {
  '30일 5K 완주 챌린지': { min_distance_m: 5000 },
  "페이스 마스터 5'00\"": { max_pace_sec_per_km: 300 },
  '아침 러닝 습관 만들기': { extra_conditions: { before_hour_kst: 9, note: '오전 9시 이전 시작 — 잠정값, 팀 협의 후 조정 필요' } },
  '아침러닝 인증 챌린지': { extra_conditions: { before_hour_kst: 9, note: '오전 9시 이전 시작 — 잠정값, 팀 협의 후 조정 필요' } }
};

for (const challenge of challenges) {
  const rule = RULES[challenge.name] ?? {};
  await client.query(
    `INSERT INTO challenge.challenge_rules
       (challenge_id, min_distance_m, max_distance_m, min_pace_sec_per_km, max_pace_sec_per_km, extra_conditions)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (challenge_id) DO UPDATE SET
       min_distance_m = EXCLUDED.min_distance_m,
       max_distance_m = EXCLUDED.max_distance_m,
       min_pace_sec_per_km = EXCLUDED.min_pace_sec_per_km,
       max_pace_sec_per_km = EXCLUDED.max_pace_sec_per_km,
       extra_conditions = EXCLUDED.extra_conditions,
       updated_at = now()`,
    [
      challenge.challenge_id,
      rule.min_distance_m ?? null,
      rule.max_distance_m ?? null,
      rule.min_pace_sec_per_km ?? null,
      rule.max_pace_sec_per_km ?? null,
      rule.extra_conditions ? JSON.stringify(rule.extra_conditions) : null
    ]
  );
  console.log(`✔ ${challenge.name}`, rule);
}

await client.end();
console.log(`총 ${challenges.length}개 챌린지에 규칙 행 생성/갱신 완료`);
