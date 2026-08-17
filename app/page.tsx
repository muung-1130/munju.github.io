import Link from 'next/link';
import { FeatureBanner } from '@/components/FeatureBanner';
import { AiRecoPanel } from '@/components/AiRecoPanel';
import { LocationPermissionButton } from '@/components/LocationPermissionButton';
import { HomeGreeting } from '@/components/HomeGreeting';
import { WeatherPanel } from '@/components/WeatherPanel';
import { RunSummaryCard } from '@/components/RunSummaryCard';
import { fetchAiRecoPanelCourses } from '@/lib/aiRecoPanelClient';

export const dynamic = 'force-dynamic';

// 세션 확인과 개인별 DB 조회(러닝 요약)는 렌더링 경로에서 걷어내서 이 페이지가 로그인 여부와
// 무관한 공개 shell로 남도록 한다 — RunSummaryCard는 마운트된 뒤 자체적으로 클라이언트에서
// 불러온다(운영서버 성능 리포트 2026-08-06 권장안). 다만 AiRecoPanel은 SSR에서 courses={[]}로
// 비워두면 클라이언트 GPS 조회(§AiRecoPanel useEffect)가 끝나기 전까지 패널 전체가 안 보여서,
// 위치 권한이 늦게 뜨거나(데스크톱) 거부되는 화면에서 "지도만 보이고 패널이 안 보인다"는
// 문제가 있었다 — 코스탐색 페이지처럼 SSR에서 미리 채워서 첫 렌더부터 보이게 한다.
export default async function HomePage() {
  const recoCourses = await fetchAiRecoPanelCourses();

  return (
    <div className="home-page">
      <FeatureBanner />

      <section className="home-hero home-hero-split">
        <div className="hero-bg" />
        <div className="hero-content">
          <p className="eyebrow">DAI RUN</p>
          <HomeGreeting />
        </div>
        <div className="hero-ai-reco">
          <AiRecoPanel courses={recoCourses} locationSlot={<LocationPermissionButton />} />
        </div>
      </section>

      <section className="home-feature-grid">
        <Link href="/courses" className="home-feature-tile accent">
          <strong>AI 러닝코스 추천</strong>
          <p>날씨와 최근 기록을 분석해 오늘 딱 맞는 코스를 추천해드려요.</p>
        </Link>
        <Link href="/crew" className="home-feature-tile">
          <strong>러닝크루</strong>
          <p>함께 달리는 크루를 찾고 주간 크루 대결에 참여해보세요.</p>
        </Link>
        <Link href="/challenges" className="home-feature-tile">
          <strong>챌린지</strong>
          <p>목표를 세우고 완주하며 나만의 러닝 기록을 쌓아가요.</p>
        </Link>
        <Link href="/shoes" className="home-feature-tile">
          <strong>AI 러닝화 수명예측</strong>
          <p>사진 한 장으로 러닝화 마모도와 교체 시기를 확인하세요.</p>
        </Link>
      </section>

      <section className="home-top-row">
        <RunSummaryCard />

        <div className="home-weather-col">
          <WeatherPanel />
        </div>
      </section>

      <section className="home-cta">
        <h2>우리 오늘 달려볼까요?</h2>
        <Link href="/courses" className="primary-btn">추천 코스 살펴보기</Link>
      </section>
    </div>
  );
}
