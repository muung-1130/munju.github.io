import { headers } from 'next/headers';
import type { AiRecoCourse } from '@/components/AiRecoPanel';

// AI 추천 패널 데이터는 course-recommendation-service로 분리되었다.
// SSR 중 직접 함수를 부르는 대신 서비스 컨테이너를 fetch하고, 로그인 상태 판별을 위해
// 원 요청의 세션 쿠키를 그대로 전달한다.
export async function fetchAiRecoPanelCourses(): Promise<AiRecoCourse[]> {
  const cookie = headers().get('cookie') ?? '';
  const baseUrl = process.env.COURSE_RECOMMENDATION_SERVICE_URL ?? 'http://course-recommendation-service:4000';

  try {
    const res = await fetch(`${baseUrl}/api/ai-recommendations/panel`, {
      headers: { cookie },
      cache: 'no-store'
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.courses ?? [];
  } catch (error) {
    console.error('fetch ai reco panel failed', error);
    return [];
  }
}
