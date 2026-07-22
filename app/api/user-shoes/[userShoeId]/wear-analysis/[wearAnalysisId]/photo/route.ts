import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SHOE_LIFE_AI_URL = process.env.SHOE_LIFE_AI_SERVICE_URL ?? 'http://192.168.0.201:8002';
const MEDIA_PROXY_SECRET = process.env.SHOE_LIFE_MEDIA_PROXY_SECRET ?? '';
const ALLOWED_ROLES = new Set(['left_outsole', 'right_outsole', 'heels', 'left_side', 'right_side']);

// 마모도 분석 결과 화면에서 업로드했던 5장의 원본 사진을 역할별로 다시 보여주기 위한 프록시.
// result_json.storage.image_keys에 이미 담겨있는 MinIO key를 짧은 만료의 presigned URL로
// 바꿔 302 리다이렉트한다 — 세션+소유권 검증을 여기서 하므로 <img src="...">로 바로 써도 안전하다.
export async function GET(
  request: NextRequest,
  { params }: { params: { userShoeId: string; wearAnalysisId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const role = request.nextUrl.searchParams.get('role');
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: '허용되지 않은 role입니다.' }, { status: 400 });
  }

  const pool = getPool();
  const { rows } = await pool.query<{ result_json: { storage?: { image_keys?: Record<string, string> } } | null }>(
    `SELECT wa.result_json
       FROM shoe.shoe_wear_analyses wa
       JOIN shoe.user_shoes us ON us.user_shoe_id = wa.user_shoe_id
      WHERE wa.wear_analysis_id = $1 AND wa.user_shoe_id = $2 AND us.user_id = $3`,
    [params.wearAnalysisId, params.userShoeId, session.user.id]
  );
  const key = rows[0]?.result_json?.storage?.image_keys?.[role];
  if (!key) {
    return NextResponse.json({ error: '사진을 찾을 수 없어요.' }, { status: 404 });
  }

  try {
    const res = await fetch(`${SHOE_LIFE_AI_URL}/api/media/presigned-url?key=${encodeURIComponent(key)}`, {
      headers: { 'x-media-proxy-secret': MEDIA_PROXY_SECRET }
    });
    if (!res.ok) {
      return NextResponse.json({ error: '사진을 불러올 수 없어요.' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.redirect(data.url);
  } catch (error) {
    console.error('wear-analysis photo presigned-url fetch failed', error);
    return NextResponse.json({ error: '사진을 불러올 수 없어요.' }, { status: 502 });
  }
}
