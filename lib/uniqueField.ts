import type { Pool } from 'pg';

// 원하는 값이 비어있으면 fallbackBase로 대체하고, 이미 쓰이는 값이면
// 중복이 없을 때까지 랜덤 숫자를 붙여서 유일한 값을 찾아준다.
// (user_name 자동 생성, nickname 자동 생성 모두에 사용)
export async function resolveUniqueField(pool: Pool, column: 'nickname' | 'user_name', desired: string | undefined, fallbackBase: string): Promise<string> {
  const base = (desired && desired.trim()) || fallbackBase;
  let candidate = base;

  for (let attempt = 0; attempt < 20; attempt += 1) {
<<<<<<< HEAD
    const { rows } = await pool.query(`SELECT 1 FROM auth_user.users WHERE ${column} = $1`, [candidate]);
=======
    const { rows } = await pool.query(`SELECT 1 FROM "user" WHERE ${column} = $1`, [candidate]);
>>>>>>> origin/main
    if (rows.length === 0) return candidate;
    const suffix = Math.floor(1000 + Math.random() * 9000);
    candidate = `${base}${suffix}`;
  }

  return `${base}${Date.now() % 100000}`;
}
