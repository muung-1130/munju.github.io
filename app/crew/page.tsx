'use client';

import { useState } from 'react';
import { Card, PageTitle } from '@/components/UI';

type Crew = {
  id: string;
  name: string;
  region: string;
  goalKm: number;
  avgPace: string;
  frequency: string;
  memberCount: number;
  fitsMyConditions: boolean;
  leaderIntro: string;
  avgRunFrequency: string;
  monthlyDistanceKm: number;
  activeMemberRatio: string;
  leaderboardRank: number;
};

const myRegion = '서울';
const myDong = '역삼동';

const crews: Crew[] = [
  { id: 'banpo-night', name: '한강 반포 야간런 크루', region: '서울', goalKm: 10, avgPace: "5'30\"/km", frequency: '주 2회', memberCount: 32, fitsMyConditions: true, leaderIntro: '퇴근 후 반포 한강공원에서 함께 야경 보며 달리는 크루예요. 초보자도 편하게 오세요!', avgRunFrequency: '주 2.3회', monthlyDistanceKm: 412, activeMemberRatio: '24/32명', leaderboardRank: 7 },
  { id: 'yeouido-morning', name: '여의도 아침 조깅 모임', region: '서울', goalKm: 8, avgPace: "5'45\"/km", frequency: '주 3회', memberCount: 24, fitsMyConditions: true, leaderIntro: '아침 공기 마시며 가볍게 달리는 모임입니다. 출근 전 상쾌하게 하루를 시작해요.', avgRunFrequency: '주 2.8회', monthlyDistanceKm: 298, activeMemberRatio: '19/24명', leaderboardRank: 15 },
  { id: 'seongsu-speed', name: '성수 트랙 스피드런', region: '서울', goalKm: 12, avgPace: "4'50\"/km", frequency: '주 2회', memberCount: 18, fitsMyConditions: false, leaderIntro: '기록 단축이 목표인 스피드 러너들의 모임이에요. 서브3 도전자 환영!', avgRunFrequency: '주 3.1회', monthlyDistanceKm: 356, activeMemberRatio: '15/18명', leaderboardRank: 3 },
  { id: 'nowon-dawn', name: '노원 새벽러너스', region: '서울', goalKm: 15, avgPace: "5'20\"/km", frequency: '주 4회', memberCount: 27, fitsMyConditions: true, leaderIntro: '새벽 5시, 하루를 가장 먼저 여는 크루입니다. 꾸준함이 무기예요.', avgRunFrequency: '주 3.6회', monthlyDistanceKm: 520, activeMemberRatio: '22/27명', leaderboardRank: 2 },
  { id: 'gangnam-afterwork', name: '강남 직장인 퇴근런', region: '서울', goalKm: 6, avgPace: "6'00\"/km", frequency: '주 2회', memberCount: 41, fitsMyConditions: false, leaderIntro: '퇴근 후 가볍게 스트레스 풀며 달리는 직장인 모임이에요. 부담 없이 오세요.', avgRunFrequency: '주 1.6회', monthlyDistanceKm: 210, activeMemberRatio: '20/41명', leaderboardRank: 58 },
  { id: 'jamsil-long', name: '잠실 롱런 클럽', region: '서울', goalKm: 20, avgPace: "5'40\"/km", frequency: '주 1회', memberCount: 15, fitsMyConditions: true, leaderIntro: '매주 일요일 장거리 훈련으로 마라톤을 준비하는 클럽입니다.', avgRunFrequency: '주 1.4회', monthlyDistanceKm: 268, activeMemberRatio: '12/15명', leaderboardRank: 24 },
  { id: 'hongdae-friday', name: '홍대 불금런', region: '서울', goalKm: 8, avgPace: "5'50\"/km", frequency: '주 1회', memberCount: 22, fitsMyConditions: false, leaderIntro: '불타는 금요일, 러닝으로 시작해요! 러닝 후 맛집 탐방은 덤.', avgRunFrequency: '주 1.1회', monthlyDistanceKm: 150, activeMemberRatio: '14/22명', leaderboardRank: 71 },
  { id: 'bundang-tancheon', name: '분당 탄천 러너스', region: '경기', goalKm: 10, avgPace: "5'25\"/km", frequency: '주 3회', memberCount: 29, fitsMyConditions: true, leaderIntro: '분당 탄천을 따라 함께 달리는 크루예요. 초중급자 모두 환영합니다.', avgRunFrequency: '주 2.9회', monthlyDistanceKm: 388, activeMemberRatio: '23/29명', leaderboardRank: 11 },
  { id: 'suwon-fortress', name: '수원 화성런 크루', region: '경기', goalKm: 12, avgPace: "5'35\"/km", frequency: '주 2회', memberCount: 20, fitsMyConditions: false, leaderIntro: '수원화성 둘레길을 달리며 역사와 러닝을 함께 즐겨요.', avgRunFrequency: '주 2.0회', monthlyDistanceKm: 240, activeMemberRatio: '14/20명', leaderboardRank: 39 },
  { id: 'haeundae-beach', name: '해운대 바다런', region: '부산', goalKm: 10, avgPace: "5'40\"/km", frequency: '주 2회', memberCount: 26, fitsMyConditions: true, leaderIntro: '해운대 해변을 따라 파도 소리 들으며 달려요. 뷰가 예술입니다.', avgRunFrequency: '주 2.2회', monthlyDistanceKm: 302, activeMemberRatio: '18/26명', leaderboardRank: 19 },
  { id: 'daegu-track', name: '동대구 트랙클럽', region: '대구', goalKm: 8, avgPace: "5'55\"/km", frequency: '주 2회', memberCount: 14, fitsMyConditions: false, leaderIntro: '트랙에서 기본기부터 차근차근! 러닝 자세 교정도 함께해요.', avgRunFrequency: '주 1.8회', monthlyDistanceKm: 132, activeMemberRatio: '9/14명', leaderboardRank: 82 },
  { id: 'incheon-songdo', name: '인천 송도 센트럴런', region: '인천', goalKm: 14, avgPace: "5'15\"/km", frequency: '주 3회', memberCount: 19, fitsMyConditions: true, leaderIntro: '송도 센트럴파크를 가로지르는 코스로 달려요. 야경 러닝도 진행합니다.', avgRunFrequency: '주 2.6회', monthlyDistanceKm: 334, activeMemberRatio: '15/19명', leaderboardRank: 28 }
];

const overallRanking = [
  { rank: 1, name: '한강 러너스', avgKm: 150.0 },
  { rank: 2, name: '탄천 러너스', avgKm: 148.7 },
  { rank: 3, name: '반포 러너스', avgKm: 147.4 },
  { rank: 4, name: '여의도 러너스', avgKm: 146.1 },
  { rank: 5, name: '성수 러너스', avgKm: 144.8 },
  { rank: 6, name: '잠실 러너스', avgKm: 143.5 },
  { rank: 7, name: '노원 러너스', avgKm: 142.2 },
  { rank: 8, name: '강남 러너스', avgKm: 140.9 },
  { rank: 9, name: '홍대 러너스', avgKm: 139.6 },
  { rank: 10, name: '이태원 러너스', avgKm: 138.3 }
];

const localRanking = [
  { rank: 1, name: '역삼 러닝메이트', avgKm: 92.4 },
  { rank: 2, name: '강남 트랙러너스', avgKm: 88.1 },
  { rank: 3, name: '역삼 새벽조깅단', avgKm: 85.6 },
  { rank: 4, name: '테헤란로 러너스', avgKm: 81.2 },
  { rank: 5, name: '강남역 나이트런', avgKm: 78.9 },
  { rank: 6, name: '역삼 피트니스런', avgKm: 75.3 },
  { rank: 7, name: '강남 직장인런', avgKm: 72.0 },
  { rank: 8, name: '역삼 위켄더스', avgKm: 68.7 },
  { rank: 9, name: '강남 페이스메이커', avgKm: 64.5 },
  { rank: 10, name: '역삼 조깅클럽', avgKm: 60.2 }
];

type Battle = {
  id: string;
  metric: '거리' | '페이스';
  daysLeft: number;
  crewA: { name: string; value: string; raw: number };
  crewB: { name: string; value: string; raw: number };
};

const battles: Battle[] = [
  { id: 'b1', metric: '거리', daysLeft: 3, crewA: { name: '한강 반포 야간런 크루', value: '182.4km', raw: 182.4 }, crewB: { name: '분당 탄천 러너스', value: '164.9km', raw: 164.9 } },
  { id: 'b2', metric: '거리', daysLeft: 5, crewA: { name: '노원 새벽러너스', value: '210.6km', raw: 210.6 }, crewB: { name: '잠실 롱런 클럽', value: '225.3km', raw: 225.3 } },
  { id: 'b3', metric: '페이스', daysLeft: 2, crewA: { name: '성수 트랙 스피드런', value: "4'52\"/km", raw: 292 }, crewB: { name: '해운대 바다런', value: "5'38\"/km", raw: 338 } },
  { id: 'b4', metric: '페이스', daysLeft: 6, crewA: { name: '여의도 아침 조깅 모임', value: "5'40\"/km", raw: 340 }, crewB: { name: '인천 송도 센트럴런', value: "5'22\"/km", raw: 322 } }
];

function battleBarPercent(battle: Battle) {
  if (battle.metric === '거리') {
    return (battle.crewA.raw / (battle.crewA.raw + battle.crewB.raw)) * 100;
  }
  const invA = 1 / battle.crewA.raw;
  const invB = 1 / battle.crewB.raw;
  return (invA / (invA + invB)) * 100;
}

function battleLeader(battle: Battle): 'A' | 'B' {
  if (battle.metric === '거리') return battle.crewA.raw >= battle.crewB.raw ? 'A' : 'B';
  return battle.crewA.raw <= battle.crewB.raw ? 'A' : 'B';
}

type ChatMessage = { from: string; text: string };

function buildMockChat(crew: Crew): ChatMessage[] {
  return [
    { from: '크루장', text: `${crew.name}에 오신 걸 환영해요! 오늘 같이 뛸 사람~` },
    { from: '멤버', text: `저요! ${crew.goalKm}km 코스로 가볼까요?` },
    { from: '크루장', text: `좋아요, ${crew.frequency} 페이스로 맞춰봐요 🏃` }
  ];
}

export default function CrewPage() {
  const [showAll, setShowAll] = useState(false);
  const [detailCrewId, setDetailCrewId] = useState<string | null>(null);
  const [chatCrewId, setChatCrewId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  const visibleCrews = showAll ? crews : crews.filter((crew) => crew.region === myRegion && crew.fitsMyConditions);
  const detailCrew = crews.find((crew) => crew.id === detailCrewId) ?? null;
  const chatCrew = crews.find((crew) => crew.id === chatCrewId) ?? null;

  function openChat(crew: Crew) {
    setDetailCrewId(null);
    setChatCrewId(crew.id);
    setChatMessages(buildMockChat(crew));
  }

  function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    setChatMessages((prev) => [...prev, { from: '나', text }]);
    setChatInput('');
  }

  return (
    <div>
      <PageTitle title="러닝크루" subtitle="내 지역, 내 페이스에 맞는 크루를 찾아 채팅방에 바로 입장하세요." />
      <div className="crew-page-grid">
        <section className="crew-list-col">
          <div className="crew-list-head">
            <div>
              <h2>크루 모집 <span className="muted">{visibleCrews.length}개</span></h2>
              <p className="muted">기본적으로 {myRegion} 지역 · 내 조건에 맞는 크루만 보여드려요.</p>
            </div>
            <label className="crew-filter-toggle">
              <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
              <span>전체보기</span>
            </label>
          </div>

          {visibleCrews.map((crew) => {
            const outOfMyCondition = showAll && (crew.region !== myRegion || !crew.fitsMyConditions);
            return (
              <Card key={crew.id} className="crew-entry">
                <div className="crew-entry-top">
                  <button className="crew-entry-title" onClick={() => setDetailCrewId(crew.id)}>
                    {crew.name}
                  </button>
                  {outOfMyCondition && <span className="type-pill">조건 외</span>}
                </div>
                <div className="crew-info-row">
                  <span>📍 {crew.region}</span>
                  <span>🎯 {crew.goalKm}km</span>
                  <span>⚡ {crew.avgPace}</span>
                  <span>🗓 {crew.frequency}</span>
                  <span>👥 {crew.memberCount}명</span>
                </div>
              </Card>
            );
          })}

          {visibleCrews.length === 0 && (
            <Card className="crew-empty">조건에 맞는 크루가 없어요. 우측 상단 전체보기를 켜보세요.</Card>
          )}
        </section>

        <aside className="crew-side-col">
          <div className="crew-ranking-split">
            <Card className="crew-ranking-card">
              <div className="card-head"><h2>전체 크루 랭킹</h2><span className="muted">TOP 10</span></div>
              <div className="crew-ranking-list">
                {overallRanking.map((entry) => (
                  <div key={entry.rank} className={`crew-rank-row ${entry.rank <= 3 ? `top top${entry.rank}` : ''}`}>
                    <span>{entry.rank}</span>
                    <b>{entry.name}</b>
                    <em>{entry.avgKm} km</em>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="crew-ranking-card">
              <div className="card-head"><h2>동네 크루 랭킹</h2><span className="muted">{myDong} · TOP 10</span></div>
              <div className="crew-ranking-list">
                {localRanking.map((entry) => (
                  <div key={entry.rank} className={`crew-rank-row ${entry.rank <= 3 ? `top top${entry.rank}` : ''}`}>
                    <span>{entry.rank}</span>
                    <b>{entry.name}</b>
                    <em>{entry.avgKm} km</em>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="crew-battle-card">
            <div className="card-head"><h2>크루 배틀 현황</h2><span className="muted">랜덤 매칭</span></div>
            <div className="crew-battle-list">
              {battles.map((battle) => {
                const leader = battleLeader(battle);
                const aPct = battleBarPercent(battle);
                return (
                  <div className="battle-row" key={battle.id}>
                    <div className="battle-meta"><span className="type-pill">{battle.metric} 대결</span><span className="muted">D-{battle.daysLeft}</span></div>
                    <div className="battle-sides">
                      <div className={`battle-side ${leader === 'A' ? 'leading' : ''}`}><b>{battle.crewA.name}</b><span>{battle.crewA.value}</span></div>
                      <div className={`battle-side right ${leader === 'B' ? 'leading' : ''}`}><b>{battle.crewB.name}</b><span>{battle.crewB.value}</span></div>
                    </div>
                    <div className="battle-bar"><i style={{ width: `${aPct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </Card>
        </aside>
      </div>

      {detailCrew && (
        <div className="crew-chat-overlay" onClick={() => setDetailCrewId(null)}>
          <div className="crew-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="crew-chat-modal-head">
              <strong>{detailCrew.name}</strong>
              <button onClick={() => setDetailCrewId(null)} aria-label="닫기">✕</button>
            </div>
            <div className="crew-info-row">
              <span>📍 {detailCrew.region}</span>
              <span>🎯 {detailCrew.goalKm}km</span>
              <span>⚡ {detailCrew.avgPace}</span>
              <span>🗓 {detailCrew.frequency}</span>
              <span>👥 {detailCrew.memberCount}명</span>
            </div>
            <div className="crew-detail">
              <p className="crew-detail-intro">“{detailCrew.leaderIntro}”</p>
              <div className="crew-detail-stats">
                <div><span>평균 러닝 주기</span><strong>{detailCrew.avgRunFrequency}</strong></div>
                <div><span>한달 누적 거리</span><strong>{detailCrew.monthlyDistanceKm}km</strong></div>
                <div><span>활동 인원</span><strong>{detailCrew.activeMemberRatio}</strong></div>
                <div><span>크루 랭킹</span><strong>{detailCrew.leaderboardRank}위</strong></div>
              </div>
            </div>
            <button className="primary-btn full-width" onClick={() => openChat(detailCrew)}>채팅방 입장하기 →</button>
          </div>
        </div>
      )}

      {chatCrew && (
        <div className="crew-chat-overlay" onClick={() => setChatCrewId(null)}>
          <div className="crew-chat-modal" onClick={(event) => event.stopPropagation()}>
            <div className="crew-chat-modal-head">
              <div>
                <strong>{chatCrew.name}</strong>
                <small>{chatCrew.region} · {chatCrew.memberCount}명</small>
              </div>
              <button onClick={() => setChatCrewId(null)} aria-label="채팅방 닫기">✕</button>
            </div>
            <div className="chat-list crew-chat-list">
              {chatMessages.map((message, index) => (
                <div key={index} className="chat-line">
                  <span className="avatar-dot">{message.from === '나' ? '나' : message.from[0]}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
            <form
              className="chat-input"
              onSubmit={(event) => {
                event.preventDefault();
                sendChat();
              }}
            >
              <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="메시지 입력..." />
              <button type="submit">➤</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
