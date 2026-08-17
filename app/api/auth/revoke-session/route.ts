import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

// 로그아웃 직전에 호출된다. NextAuth는 JWT 쿠키만 지우고 auth_user.auth_sessions 행은
// 그대로 두기 때문에(회수 안 됨), 로그아웃할 때 이 API로 해당 세션을 명시적으로 revoke한다.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (session?.sessionId) {
    const pool = getPool();
    await pool.query(
      'UPDATE auth_user.auth_sessions SET revoked_at = now() WHERE session_id = $1 AND revoked_at IS NULL',
      [session.sessionId]
    );
  }
  return NextResponse.json({ success: true });
}
