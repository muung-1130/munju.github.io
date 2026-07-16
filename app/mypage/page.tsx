import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card, Donut, MiniLineChart, PageTitle, StatCard } from '@/components/UI';

const records = [
  ['동탄 호수공원 러닝', '2025.05.28', '8.21km', "5'29\"/km", '46:19'],
  ['5월 100km 챌린지 런', '2025.05.27', '42.3km', "5'31\"/km", '3:54:12'],
  ['서울 한강야경 런', '2025.05.25', '10.15km', "5'45\"/km", '58:32'],
  ['여의도 아침 조깅', '2025.05.21', '6.21km', "5'24\"/km", '33:41']
];

function formatJoinDate(iso?: string) {
  if (!iso) return '-';
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

export default async function MyPage() {
  const session = await getServerSession(authOptions);
  const nickname = session?.user?.name ?? '러너';
  const email = session?.user?.email ?? '-';
  const joinDate = formatJoinDate(session?.user?.createdAt);

  return (
    <div>
      <PageTitle title="마이페이지" subtitle="나의 러닝 활동과 성과를 한눈에 확인하세요." action={<select className="month-select"><option>이번 달</option></select>} />
      <Card className="profile-summary"><div className="profile-left"><img src="/assets/avatar-runner.jpg" alt="러너 프로필" /><div><h2>{nickname} <span>PRO</span></h2><p>{email}</p><p>가입일 {joinDate}</p></div></div><StatCard icon="〽" label="총 누적 거리" value="142.6" suffix="km" /><StatCard icon="⏱" label="평균 페이스" value="5'32”" suffix="/km" /><StatCard icon="📅" label="러닝 횟수" value="18" suffix="회" /><StatCard icon="📈" label="누적 획득 고도" value="12,450" suffix="m" /></Card>
      <section className="dashboard-grid">
        <Card className="pace-card"><div className="card-head"><h2>페이스 추이</h2><div className="segmented"><button>주간</button><button className="active">월간</button><button>연간</button></div></div><MiniLineChart /></Card>
        <Card className="heart-zone"><h2>심박수 분포</h2><div className="heart-content"><Donut value={75} label="146" /><ul><li><i className="red" />최대 5%</li><li><i className="orange" />무산소 15%</li><li><i className="yellow" />유산소 45%</li><li><i className="green" />지방연소 25%</li><li><i className="blue" />회복 10%</li></ul></div></Card>
        {[
          ['자란한 포인트','12,450 P','포인트 내역 보기','📊'],['보유 뱃지','28개','뱃지 컬렉션 보기','🏅'],['보유 챌린지','3개','챌린지 목록 보기','🏆'],['크루 활동','2개','내 크루 보기','👥'],['마라톤 완주','2회','기록 보기','👟'],['연속 러닝','21일','기록 보기','🔥']
        ].map((s)=><Card key={s[0]} className="mini-stat-card"><span>{s[3]}</span><h3>{s[0]}</h3><strong>{s[1]}</strong><button>{s[2]} →</button></Card>)}
        <Card id="running-records" className="recent-card"><div className="card-head"><h2>최근 러닝 기록</h2><button className="text-link">전체 보기 ›</button></div>{records.map((r)=><div className="record-row" key={r[0]}><span>🏃</span><b>{r[0]}</b><em>{r[1]}</em><strong>{r[2]}</strong><span>{r[3]}</span><span>{r[4]}</span></div>)}<button className="ghost-btn full-width">러닝 기록 전체 보기 →</button></Card>
        <Card className="recent-course"><div className="card-head"><h2>최근 러닝 코스</h2><button className="text-link">전체 보기 ›</button></div>{['동탄 호수공원 코스','여의도 한강공원 코스','아차산 둘레길 코스'].map((x,i)=><div className="course-history" key={x}><img src={`/assets/course-thumb-${(i%3)+1}.jpg`} alt="" /><div><b>{x}</b><span>{[8.2,10.1,9.5][i]}km · {['경기 화성시','서울 영등포구','서울 광진구'][i]}</span></div><em>{[5,3,2][i]}회</em></div>)}<button className="ghost-btn full-width">내 코스 전체 보기 →</button></Card>
        <Card className="owned-shoes"><div className="card-head"><h2>보유 러닝화</h2><button className="text-link">전체 보기 ›</button></div>{[['나이키 페가수스 41','718.0km','4개월'],['아식스 젤-카야노 30','380.0km','3개월'],['뉴발란스 프레쉬폼 X 1080 v13','260.0km','2개월']].map((s,i)=><div className="owned-row" key={s[0]}><img src={`/assets/shoe-${(i%3)+1}.jpg`} alt="" /><div><b>{s[0]}</b><span>총 거리 {s[1]} · 보유 기간 {s[2]}</span></div><button>🗑</button></div>)}<button className="ghost-btn full-width">내 러닝화 관리 →</button></Card>
      </section>
    </div>
  );
}
