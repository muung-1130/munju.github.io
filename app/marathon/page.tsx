import { Card, PageTitle } from '@/components/UI';

const events = ['2025 서울국제마라톤', '2025 JTBC 서울마라톤', '2025 춘천마라톤', '2025 부산바다마라톤', '2025 대구국제마라톤'];

export default function MarathonPage() {
  return (
    <div>
      <PageTitle title="마라톤" subtitle="대회 일정, 접수 상태, 코스 분석과 연습 코스를 한 번에 확인하세요." />
      <div className="marathon-layout">
        <Card className="event-list"><div className="card-head"><h2>마라톤 이벤트</h2><button className="text-link">전체 보기 ›</button></div>{events.map((event, idx)=><div key={event} className={`event-item ${idx === 0 ? 'selected' : ''}`}><img src="/assets/marathon-thumb.jpg" alt="" /><div><strong>{event}</strong><p>2025.{idx === 0 ? '06.15' : idx === 1 ? '11.02' : idx === 2 ? '10.12' : idx === 3 ? '11.16' : '04.06'} (일)</p><span>풀 · 하프 · 10K</span></div><button>신청하기</button></div>)}</Card>
        <section className="marathon-main">
          <Card className="marathon-hero-card"><div className="card-head"><h2>2025 서울국제마라톤 <span className="cert">공식 인증 대회</span></h2><div><button className="ghost-btn small">공유하기</button><button className="ghost-btn small">🔖</button></div></div><img src="/assets/marathon-main.jpg" alt="서울국제마라톤 코스" className="marathon-hero-img" /><div className="marathon-info-row"><span>📅 2025.06.15 (일)<b>07:00 출발</b></span><span>📍 서울, 잠실 종합운동장<b>서울특별시 송파구</b></span><span>🗓 ~2025.05.15<b>17:00 마감</b></span><span>👥 서울특별시<b>대한육상연맹</b></span></div><p>서울의 아름다운 도심을 달리는 대표 국제 마라톤 대회입니다. 한강과 도심의 풍경을 만끽하며 자신의 한계에 도전해보세요.</p><div className="feature-grid"><span>코스 유형 <b>도심 순환 코스</b></span><span>코스 거리 <b>42.195km</b></span><span>누적 상승고도 <b>+230m</b></span><span>2024 참가자 <b>18,742명</b></span></div><div className="button-row"><button className="primary-btn wide">대회 신청하기</button><button className="ghost-btn wide">코스 상세 보기</button></div></Card>
          <Card><h2>나에게 맞는 유사한 훈련 코스 추천</h2><div className="similar-row">{['여의도 한강 코스','뚝섬 한강 코스','강나루 코스','탄천코스(초보)'].map((x,i)=><div key={x}><img src={`/assets/course-thumb-${(i%3)+1}.jpg`} alt="" /><strong>{x}</strong><span>{[15.6,13.3,18.2,12.5][i]}km · 왕복 ⭐ 4.{7-i}</span></div>)}</div></Card>
        </section>
        <aside className="side-column"><Card className="analysis-card"><h2>AI 코스 분석 <span>Beta</span></h2>{[['총 거리','42.195 km'],['고도 상승','230 m'],['고도 하강','226 m'],['최고 고도','52 m'],['직선 구간 비율','52%'],['평균 페이스 예상',"5'20\"~5'40\"/km"],['코스 유사도','78%']].map(([a,b])=><p key={a}><span>{a}</span><b>{b}</b></p>)}<div className="mini-course-map"><svg viewBox="0 0 260 150"><polyline points="30,120 50,70 90,50 130,65 160,35 200,55 225,100 180,125 115,110 70,130" fill="none" stroke="#1764f2" strokeWidth="5" /><circle cx="30" cy="120" r="8" fill="#f4484e" /></svg></div></Card></aside>
      </div>
    </div>
  );
}
