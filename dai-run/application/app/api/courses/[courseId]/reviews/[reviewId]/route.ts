import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deleteCourseReview, updateCourseReview } from '@/lib/courseSocial';

function isValidRating(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 5 && Math.round(value * 2) === value * 2;
}

export async function PATCH(request: NextRequest, { params }: { params: { reviewId: string } }) {
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

  const updated = await updateCourseReview({
    reviewId: params.reviewId,
    userId: session.user.id,
    overallRating,
    surfaceRating,
    sceneryRating,
    slopeRating,
    content: typeof content === 'string' ? content.trim().slice(0, 2000) : ''
  });

  if (!updated) {
    return NextResponse.json({ error: '리뷰를 찾을 수 없거나 수정 권한이 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: { reviewId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }

  const deleted = await deleteCourseReview(params.reviewId, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: '리뷰를 찾을 수 없거나 삭제 권한이 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
