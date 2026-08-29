import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCourseRouteForRun, startRun } from '@/lib/runTracking';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  }
  const body = await request.json();
  const courseId = typeof body.courseId === 'string' ? body.courseId : null;
  if (!courseId) {
    return NextResponse.json({ error: '코스를 확인해주세요.' }, { status: 400 });
  }

  const course = await getCourseRouteForRun(courseId);
  if (!course || course.positions.length < 2) {
    return NextResponse.json({ error: '이 코스는 경로 정보가 없어 트래킹할 수 없어요.' }, { status: 404 });
  }

  const runId = await startRun(session.user.id, courseId);
  return NextResponse.json({ runId, course });
}
