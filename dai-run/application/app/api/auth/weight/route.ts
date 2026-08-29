import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const pool = getPool();
  const { rows } = await pool.query(`SELECT weight_kg FROM auth_user.users WHERE user_id = $1`, [session.user.id]);
  return NextResponse.json({ weightKg: rows[0]?.weight_kg !== undefined ? Number(rows[0].weight_kg) : null });
}

// 마이페이지 칼로리 카드의 연필 아이콘으로 몸무게만 빠르게 수정하는 용도(전체 프로필 수정과 분리).
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const body = await request.json();
  const weightKg = Number(body.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 250) {
    return NextResponse.json({ error: '몸무게를 20~250kg 사이로 입력해주세요.' }, { status: 400 });
  }
  const pool = getPool();
  await pool.query(`UPDATE auth_user.users SET weight_kg = $1, updated_at = now() WHERE user_id = $2`, [weightKg, session.user.id]);

  // 몸무게를 바꾸면 마이페이지에 이미 보여주고 있던 칼로리 합계도 새 체중 기준으로 다시 맞아야
  // 하니, 이 사용자의 기존 기록도 같이 재계산한다(공식은 lib/calorie.ts의 estimateCaloriesKcal과
  // 반드시 동일하게 유지해야 함: 거리(km) × 체중(kg) × 1.036).
  await pool.query(
    `UPDATE running_record.runs
        SET calories_kcal = ROUND((distance_m / 1000.0) * $1 * 1.036)
      WHERE user_id = $2 AND status IN ('COMPLETED', 'STOPPED') AND distance_m IS NOT NULL AND distance_m > 0`,
    [weightKg, session.user.id]
  );

  return NextResponse.json({ success: true, weightKg });
}
