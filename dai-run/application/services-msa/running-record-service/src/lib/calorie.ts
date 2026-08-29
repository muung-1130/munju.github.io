// 체중을 입력하지 않은 사용자를 위한 기본값 — 한국 성인 평균 체중(질병관리청 국민건강영양조사
// 기준 남 74kg / 여 58kg)을 쓴다. 성별이 없으면 둘의 평균을 쓴다.
export function defaultWeightKgForGender(gender: string | null): number {
  if (gender === 'M') return 74;
  if (gender === 'F') return 58;
  return 66;
}

// 러닝 칼로리 소모량 추정 공식 — 체중(kg) × 거리(km) × 1.036 (러닝에서 흔히 쓰이는 근사치, MET
// 기반 공식을 단순화한 값). 정밀한 심박수 기반 계산이 아니라 참고용 추정치임을 사용자에게 안내한다.
export function estimateCaloriesKcal(distanceM: number, weightKg: number): number {
  const distanceKm = distanceM / 1000;
  return Math.round(distanceKm * weightKg * 1.036);
}

// 마이페이지 칼로리 카드에 "(74kg 기준)"처럼 표시할 실제 체중값. 저장된 값이 없으면(과거 계정)
// 성별 평균으로 대체해서 보여준다.
export async function getUserWeightKgForDisplay(userId: string): Promise<number> {
  const { getPool } = await import('./db.js');
  const pool = getPool();
  const { rows } = await pool.query(`SELECT weight_kg, gender FROM auth_user.users WHERE user_id = $1`, [userId]);
  const row = rows[0];
  if (!row) return defaultWeightKgForGender(null);
  return row.weight_kg !== null && row.weight_kg !== undefined ? Number(row.weight_kg) : defaultWeightKgForGender(row.gender);
}
