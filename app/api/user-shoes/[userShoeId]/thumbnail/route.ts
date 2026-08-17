import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SHOE_LIFE_AI_URL = process.env.SHOE_LIFE_AI_SERVICE_URL ?? 'http://192.168.0.212:8002';
const MEDIA_PROXY_SECRET = process.env.SHOE_LIFE_MEDIA_PROXY_SECRET ?? '';

// 카탈로그 모델이 없는(직접 등록한) 러닝화의 썸네일 — shoe-life-ai가 MinIO에 올려둔 분석 사진 중
// 하나를 짧은 만료의 presigned URL로 받아와 그대로 302 리다이렉트한다. 이 라우트 자체는
// 세션+소유권 검증을 하므로 <img src="/api/user-shoes/{id}/thumbnail">처럼 그대로 써도 안전하다.
export async function GET(_request: Request, { params }: { params: { userShoeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const pool = getPool();
  const { rows } = await pool.query<{ custom_thumbnail_key: string | null }>(
    `SELECT custom_thumbnail_key FROM shoe.user_shoes WHERE user_shoe_id = $1 AND user_id = $2`,
    [params.userShoeId, session.user.id]
  );
  const key = rows[0]?.custom_thumbnail_key;
  if (!key) {
    return NextResponse.json({ error: '썸네일이 없어요.' }, { status: 404 });
  }

  try {
    const res = await fetch(`${SHOE_LIFE_AI_URL}/api/media/presigned-url?key=${encodeURIComponent(key)}`, {
      headers: { 'x-media-proxy-secret': MEDIA_PROXY_SECRET }
    });
    if (!res.ok) {
      return NextResponse.json({ error: '썸네일을 불러올 수 없어요.' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.redirect(data.url);
  } catch (error) {
    console.error('thumbnail presigned-url fetch failed', error);
    return NextResponse.json({ error: '썸네일을 불러올 수 없어요.' }, { status: 502 });
  }
}
