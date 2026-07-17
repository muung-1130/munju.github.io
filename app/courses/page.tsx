import { Card, PageTitle } from '@/components/UI';
<<<<<<< HEAD
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
=======
import { CourseRouteSection } from '@/components/CourseRouteSection';

const courses = [
  { img: 'course-thumb-1.jpg', name: '여의도 한강공원 코스', area: '강남구', distance: '2.8km', level: '쉬움', score: '4.8' },
  { img: 'course-thumb-2.jpg', name: '선정릉 한바퀴 코스', area: '강남구', distance: '5.1km', level: '보통', score: '4.7' },
  { img: 'course-thumb-3.jpg', name: '탄천변 러닝 코스', area: '강남구', distance: '7.2km', level: '보통', score: '4.6' }
];

export default function CoursePage() {
  return (
    <div className="content-grid course-layout">
      <section className="main-column">
        <PageTitle title="코스 탐색" subtitle="내 위치 주변의 최적 코스를 추천해드려요." />
        <div className="tab-row"><button className="active">동네 경로 추천</button><button>마라톤 연습 코스</button><button>사용자 코스</button><button>인기 코스</button></div>
        <Card className="map-card-large">
          <div className="filter-row">
            <strong>내 위치 <span>서울특별시 강남구 역삼동</span></strong>
            <button>반경 5km⌄</button><button>거리⌄</button><button>난이도⌄</button><button>지형⌄</button><button>필터 초기화</button>
          </div>
          <div className="fake-map">
            <span className="river river-a">한강</span><span className="map-name n1">선릉역</span><span className="map-name n2">역삼역</span><span className="map-name n3">강남역</span>
            <svg viewBox="0 0 800 380" className="map-routes">
              <polyline points="160,120 220,90 260,160 320,130 360,200 410,170" fill="none" stroke="#135be8" strokeWidth="7" strokeLinejoin="round" />
              <polyline points="460,140 540,115 610,170 595,245 505,260 470,205" fill="none" stroke="#ff8b1a" strokeWidth="7" strokeLinejoin="round" />
              <polyline points="260,240 330,280 400,260 455,300 535,285" fill="none" stroke="#55ad69" strokeWidth="7" strokeLinejoin="round" />
            </svg>
            <span className="map-pin blue" style={{ left: '25%', top: '35%' }}>1</span><span className="map-pin orange" style={{ left: '59%', top: '32%' }}>2</span><span className="map-pin green" style={{ left: '44%', top: '68%' }}>3</span>
            <div className="legend"><b>코스 난이도</b><span><i className="green" />쉬움</span><span><i className="blue" />보통</span><span><i className="orange" />어려움</span></div>
            <div className="map-controls"><button>＋</button><button>－</button><button>◎</button></div>
          </div>
        </Card>
        <h2 className="section-title">추천 코스 목록</h2>
        <div className="course-cards">
          {courses.map((course, index) => <Card key={course.name} className="course-card"><span className="rank-badge">{index + 1}</span><img src={`/assets/${course.img}`} alt="" /><h3>{course.name}</h3><p>{course.area} · {course.distance} · {course.level}</p><p>한강의 시원한 바람과 함께 가볍게 달릴 수 있는 코스예요.</p><div className="course-meta"><span>↔ {course.distance}</span><span>⏱ {index === 0 ? '30분' : index === 1 ? '52분' : '1시간 10분'}</span><span>⭐ {course.score}</span><button>♡</button></div></Card>)}
        </div>
        <h2 className="section-title">코스 상세 경로</h2>
        <CourseRouteSection />
      </section>
      <aside className="side-column">
        <Card className="dark-panel"><div className="card-head"><h3>오늘의 AI 추천 코스</h3><span>AI 추천</span></div><p>오늘의 날씨와 컨디션을 고려한 맞춤 코스를 추천해드릴게요!</p><div className="dark-inner"><strong>여의도 한강공원 코스</strong><span>3.2km · 예상 시간 32분</span><button>코스 자세히 보기</button></div></Card>
>>>>>>> origin/main
        <Card><h3>코스 통계</h3><div className="three-stats"><span><b>126.8</b>km</span><span><b>24</b>개</span><span><b>4.7</b>/5</span></div></Card>
        <Card><h3>인기 키워드</h3><div className="chip-wrap">{['한강','공원','야경','업힐','탄천','벚꽃길','조깅','초보추천'].map((x)=><span key={x}>{x}</span>)}</div></Card>
      </aside>
    </div>
  );
}
