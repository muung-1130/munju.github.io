import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createCourseReview, getCourseReviews } from '@/lib/courseSocial';

function isValidRating(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 5 && Math.round(value * 2) === value * 2;
}

export async function GET(request: NextRequest, { params }: { params: { courseId: string } }) {
  const reviews = await getCourseReviews(params.courseId);
  return NextResponse.json({ reviews });
}

export async function POST(request: NextRequest, { params }: { params: { courseId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const body = await request.json();
  const { overallRating, surfaceRating, sceneryRating, slopeRating, content } = body ?? {};

  if (![overallRating, surfaceRating, sceneryRating, slopeRating].every(isValidRating)) {
    return NextResponse.json({ error: '별점은 0~5 사이 0.5 단위로 입력해주세요.' }, { status: 400 });
  }
  if (overallRating === 0) {
    return NextResponse.json({ error: '전체 평점을 선택해주세요.' }, { status: 400 });
  }

  await createCourseReview({
    courseId: params.courseId,
    userId: session.user.id,
    overallRating,
    surfaceRating,
    sceneryRating,
    slopeRating,
    content: typeof content === 'string' ? content.trim().slice(0, 2000) : ''
  });

  return NextResponse.json({ success: true });
}
