import { Card, PageTitle } from '@/components/UI';
import { AiRecoPanel } from '@/components/AiRecoPanel';
import { CourseNearbyExplorer } from '@/components/CourseNearbyExplorer';
import { getRandomCourses } from '@/lib/course';

export const dynamic = 'force-dynamic';

export default async function CoursePage() {
  const recoCourses = await getRandomCourses(3);

  return (
    <div className="content-grid course-layout">
      <section className="main-column">
        <PageTitle title="코스 탐색" subtitle="내 위치 반경 안의 코스를 찾아드려요." />
        <Card className="map-card-large course-nearby-wrap">
          <CourseNearbyExplorer />
        </Card>
      </section>
      <aside className="side-column">
        <AiRecoPanel courses={recoCourses} />
        <Card><h3>코스 통계</h3><div className="three-stats"><span><b>126.8</b>km</span><span><b>24</b>개</span><span><b>4.7</b>/5</span></div></Card>
        <Card><h3>인기 키워드</h3><div className="chip-wrap">{['한강','공원','야경','업힐','탄천','벚꽃길','조깅','초보추천'].map((x)=><span key={x}>{x}</span>)}</div></Card>
      </aside>
    </div>
  );
}
