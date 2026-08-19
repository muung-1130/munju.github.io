import Link from 'next/link';
import { Card, PageTitle } from '@/components/UI';
import { AiRecoPanel } from '@/components/AiRecoPanel';
import { CourseNearbyExplorer } from '@/components/CourseNearbyExplorer';
import { RunningPreferencesOnboardingModal } from '@/components/RunningPreferencesOnboardingModal';
import { fetchAiRecoPanelCourses } from '@/lib/aiRecoPanelClient';

export const dynamic = 'force-dynamic';

export default async function CoursePage() {
  const recoCourses = await fetchAiRecoPanelCourses();
  const courseDemoBackground =
    'linear-gradient(135deg, #FFF3E6 0%, #FFB36B 100%)';

  return (
    <div
      data-cicd-demo="course-theme"
      style={{
        minHeight: 'calc(100vh - 170px)',
        padding: '24px',
        borderRadius: '18px',
        background: courseDemoBackground,
        transition: 'background 300ms ease',
      }}
    >
      <PageTitle
        title="코스 탐색"
        subtitle="내 위치 반경 안의 코스를 찾아드려요."
        action={
          <Link href="/mypage#liked-courses" className="ghost-btn">
            찜한 코스 보기
          </Link>
        }
      />
      <RunningPreferencesOnboardingModal />
      <div className="content-grid course-layout">
        <section className="main-column">
          <Card className="map-card-large course-nearby-wrap">
            <CourseNearbyExplorer />
          </Card>
          <Card className="course-free-run-banner">
            <div className="card-head">
              <h2>자율 달리기</h2>
            </div>
            <p className="muted">정해진 코스 없이 자유롭게 달리고, 마음에 든 경로는 내 닉네임으로 코스 탐색에 추천해보세요.</p>
            <Link href="/run/free" className="primary-btn">
              자율 달리기 시작
            </Link>
          </Card>
        </section>
        <aside className="side-column">
          <AiRecoPanel courses={recoCourses} />
        </aside>
      </div>
    </div>
  );
}