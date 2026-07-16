import Link from 'next/link';
import { Card, HourlyWeatherChart, MiniLineChart, StatCard } from '@/components/UI';
import { FeatureBanner } from '@/components/FeatureBanner';
import { ChallengeJoinCard } from '@/components/ChallengeJoinCard';

const nearbyCourses = ['반포 한강공원 코스', '잠원-반포 왕복 코스', '여의도 한강공원 코스'];

export default function HomePage() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="hero-bg" />
        <div className="hero-content">
          <p className="eyebrow">DAI RUN</p>
          <h1>안녕하세요, 러너님!<br />오늘도 멋진 하루를 달려보세요! 🏃✨</h1>
          <Card className="ai-reco-card">
            <div className="ai-reco-map">
              <svg viewBox="0 0 240 220" className="route-svg" role="img" aria-label="추천 코스 지도">
                <path d="M42,196 C28,150 74,142 62,102 C48,60 104,54 92,18" fill="none" stroke="#1259ee" strokeWidth="7" strokeLinecap="round" />
                <circle cx="42" cy="196" r="9" fill="#ff5b5b" />
                <circle cx="92" cy="18" r="9" fill="#1259ee" />
              </svg>
            </div>
            <div className="ai-reco-info">
              <div className="card-head ai-head">
                <div className="ai-head-left">
                  <span className="ai-avatar-small"><img src="/assets/dog-assistant.png" alt="AI 러닝 비서" /></span>
                  <strong>AI 러닝 어시스턴트</strong>
                </div>
                <span>AI</span>
              </div>
              <p className="ai-reco-msg">오늘은 <b>18km 서울 마라톤 코스</b>를 추천드려요. 컨디션 최고예요! 💙</p>
              <div className="ai-course-meta">
                <span className="ai-course-location">📍 서울 반포 한강공원</span>
                <strong className="ai-course-distance">18.2km</strong>
              </div>
              <div className="slope-highlight">
                <span className="slope-label">평균 경사도</span>
                <div className="slope-value"><strong>2.4%</strong><em>완만함</em></div>
                <div className="slope-bar"><i style={{ width: '32%' }} /></div>
              </div>
              <button className="primary-btn full-width">추천 코스로 달리기 시작 →</button>
            </div>
          </Card>
        </div>
      </section>

      <FeatureBanner />

      <section className="home-grid">
        <Card className="weather-card">
          <h3>오늘의 날씨</h3>
          <HourlyWeatherChart />
          <p>맑음 · 습도 48% · 체감 18°C</p>
          <p>바람 1.2 m/s · 러닝하기 좋은 날씨예요.</p>
        </Card>

        <Card className="dust-card">
          <h3>미세먼지</h3>
          <strong className="good">좋음 🙂</strong>
          <div className="dust-values"><span>PM10 <b>42</b>㎍/m³</span><span>PM2.5 <b>15</b>㎍/m³</span></div>
          <div className="range-bar"><i /></div>
        </Card>

        <Card className="nearby-card">
          <h3>내 주변 추천 코스</h3>
          <div className="map-preview"><div className="route-line" /><span className="pin p1">1</span><span className="pin p2">2</span><span className="pin p3">3</span></div>
          {nearbyCourses.map((course, index) => <p key={course}><b>{course}</b><span>{index === 0 ? '8.2km · 5’45” /km · 보통' : index === 1 ? '10.4km · 5’32” /km · 보통' : '7.1km · 6’05” /km · 쉬움'}</span></p>)}
          <Link href="/courses" className="ghost-btn">코스 더보기</Link>
        </Card>

        <Card className="summary-card">
          <div className="card-head"><h3>나의 러닝 요약</h3><select><option>주간</option></select></div>
          <div className="summary-stats">
            <StatCard icon="↔" label="거리" value="42.3" suffix="km" />
            <StatCard icon="⏱" label="시간" value="5:45:38" />
            <StatCard icon="⚡" label="페이스" value="5'28”" suffix="/km" />
            <StatCard icon="🔥" label="칼로리" value="3,245" suffix="kcal" />
          </div>
          <MiniLineChart />
          <Link href="/mypage#running-records" className="ghost-btn">상세 기록 보기</Link>
        </Card>

        <ChallengeJoinCard />
      </section>
    </div>
  );
}
