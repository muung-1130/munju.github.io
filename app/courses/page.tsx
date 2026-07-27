import { Card, PageTitle } from '@/components/UI';
import { AiRecoPanel } from '@/components/AiRecoPanel';
import { CourseNearbyExplorer } from '@/components/CourseNearbyExplorer';
import { RunningPreferencesOnboardingModal } from '@/components/RunningPreferencesOnboardingModal';
import { fetchAiRecoPanelCourses } from '@/lib/aiRecoPanelClient';
import { getCourseDistanceBucketCounts, getCourseOverallStats } from '@/lib/course';

export const dynamic = 'force-dynamic';

export default async function CoursePage() {
  const [recoCourses, bucketCounts, overallStats] = await Promise.all([
    fetchAiRecoPanelCourses(),
    getCourseDistanceBucketCounts(),
    getCourseOverallStats()
  ]);

  return (
    <div>
      <PageTitle title="코스 탐색" subtitle="내 위치 반경 안의 코스를 찾아드려요." />
      <RunningPreferencesOnboardingModal />
      <AiRecoPanel courses={recoCourses} />
      <div className="content-grid course-layout">
        <section className="main-column">
          <Card className="map-card-large course-nearby-wrap">
            <CourseNearbyExplorer />
          </Card>
        </section>
        <aside className="side-column">
          <Card>
            <h3>코스 통계</h3>
            <table className="course-distance-bucket-table">
              <thead>
                <tr>
                  {bucketCounts.map((bucket) => (
                    <th key={bucket.label}>{bucket.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {bucketCounts.map((bucket) => (
                    <td key={bucket.label}>{bucket.count}개</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <div className="three-stats">
              <span>
                <b>{overallStats.courseCount}</b>개 코스
              </span>
              <span>
                <b>{overallStats.totalViewCount.toLocaleString()}</b>회 조회
              </span>
              <span>
                <b>{overallStats.totalLikeCount.toLocaleString()}</b>회 찜
              </span>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
