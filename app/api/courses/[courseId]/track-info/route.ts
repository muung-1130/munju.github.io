import { NextRequest, NextResponse } from 'next/server';
import { getCourseRouteForRun } from '@/lib/runTracking';

export const dynamic = 'force-dynamic';

// /run/[courseId] 화면이 "출발" 누르기 전 미리보기 단계에서 러닝 기록을 만들지 않고 코스 경로만
// 읽어오는 용도.
export async function GET(_request: NextRequest, { params }: { params: { courseId: string } }) {
  const course = await getCourseRouteForRun(params.courseId);
  if (!course) {
    return NextResponse.json({ error: '코스를 찾을 수 없어요.' }, { status: 404 });
  }
  return NextResponse.json({ course });
}
