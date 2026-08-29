import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCourseLikeState, toggleCourseLike } from '@/lib/courseSocial';

export async function GET(request: NextRequest, { params }: { params: { courseId: string } }) {
  const session = await getServerSession(authOptions);
  const state = await getCourseLikeState(params.courseId, session?.user?.id ?? null);
  return NextResponse.json(state);
}

export async function POST(request: NextRequest, { params }: { params: { courseId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const state = await toggleCourseLike(params.courseId, session.user.id);
  return NextResponse.json(state);
}
