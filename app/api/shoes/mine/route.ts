import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserShoesDetailed } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

// 러닝화 페이지의 "수명 예측" 탭에서 실제 사진 업로드 분석은 신발별 상세 페이지에서 하므로,
// 여기서는 로그인한 사용자가 보유한 러닝화 목록만 내려줘 그 상세 페이지로 안내한다.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ shoes: [] });
  }
  const shoes = await getUserShoesDetailed(session.user.id);
  return NextResponse.json({ shoes });
}
