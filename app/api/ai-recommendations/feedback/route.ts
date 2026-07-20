import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { FEEDBACK_TYPES, recordRecommendationFeedback } from '@/lib/aiRecommendation';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const body = await request.json();
  const { recommendationId, courseId, feedbackType } = body ?? {};

  if (typeof recommendationId !== 'string' || typeof courseId !== 'string') {
    return NextResponse.json({ error: 'recommendationId와 courseId가 필요해요.' }, { status: 400 });
  }
  if (!FEEDBACK_TYPES.includes(feedbackType)) {
    return NextResponse.json({ error: `feedbackType은 ${FEEDBACK_TYPES.join('/')} 중 하나여야 해요.` }, { status: 400 });
  }

  try {
    await recordRecommendationFeedback(session.user.id, recommendationId, courseId, feedbackType);
    return NextResponse.json({ success: true });
  } catch {
    // 존재하지 않는 recommendation_id 등으로 FK 위반이 나도 UX를 막을 정도의 일은 아니라 조용히 무시한다.
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
