import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/UI';
import { getMarathonRaceById, getRegistrationWindow, getRaceCapacityStatus } from '@/lib/marathon';
import { formatKstDateTime } from '@/lib/format';

export default async function MarathonOfficialPage({ params }: { params: { raceId: string } }) {
  const raceId = Number(params.raceId);
  if (!Number.isFinite(raceId)) notFound();

  const race = await getMarathonRaceById(raceId);
  if (!race) notFound();

  const [registrationWindow, capacityStatus] = await Promise.all([
    getRegistrationWindow(raceId),
    getRaceCapacityStatus(raceId)
  ]);

  return (
    <div className="marathon-official-page">
      <Link href={`/marathon/${race.raceId}`} className="back-link">← 대회 상세로</Link>

      <section className="marathon-official-hero">
        {race.isExclusiveCollab && <span className="marathon-collab-badge">DAI RUN 단독 초청</span>}
        <h1>{race.raceName}</h1>
        <p className="marathon-official-tagline">
          도심을 가로지르는 {race.raceDistance} 코스에서, DAI RUN 러너들만을 위한 특별한 하루를 만나보세요.
        </p>
        <div className="marathon-official-hero-meta">
          <div>
            <span>대회일</span>
            <strong>{race.raceDate ?? '미정'}</strong>
          </div>
          <div>
            <span>거리</span>
            <strong>{race.raceDistance}</strong>
          </div>
          <div>
            <span>지역</span>
            <strong>{race.region ?? '전국'}</strong>
          </div>
          <div>
            <span>정원</span>
            <strong>{race.capacity ? `${race.capacity}명` : '제한 없음'}</strong>
          </div>
        </div>
        <Link href={`/marathon/${race.raceId}`} className="primary-btn marathon-official-cta">
          DAI RUN에서 신청하기
        </Link>
      </section>

      <div className="marathon-official-grid">
        <Card className="marathon-official-section">
          <h2>대회 소개</h2>
          <p>
            {race.raceName}은 DAI RUN이 파트너 러닝 크루와 함께 준비한 단독 초청 대회예요. 도심 랜드마크를 잇는 코스를
            따라 페이스메이커와 함께 달리고, 완주 후에는 참가자 전원에게 기념품과 완주 인증서가 제공돼요.
          </p>
          <ul className="marathon-official-highlights">
            <li>🏅 전 구간 페이스메이커 배치</li>
            <li>🎽 참가자 전원 기능성 러닝 저지 + 완주 메달{race.souvenir ? ` (${race.souvenir})` : ''}</li>
            <li>📸 코스 곳곳 포토 스팟과 공식 기록 사진 제공</li>
            <li>🚑 전 구간 응급 의료 지원 및 급수·보급 스테이션 운영</li>
          </ul>
        </Card>

        <Card className="marathon-official-section">
          <h2>당일 일정</h2>
          <ol className="marathon-official-timeline">
            <li>
              <strong>06:00</strong> 현장 접수 및 배번 수령
            </li>
            <li>
              <strong>07:30</strong> 개회식 및 워밍업
            </li>
            <li>
              <strong>08:00</strong> 웨이브 스타트(그룹별 순차 출발)
            </li>
            <li>
              <strong>~13:00</strong> 코스 통제 종료 및 피니시라인 마감
            </li>
            <li>
              <strong>10:00~</strong> 완주자 시상식 및 경품 추첨
            </li>
          </ol>
        </Card>

        <Card className="marathon-official-section">
          <h2>참가 안내</h2>
          <dl className="marathon-official-faq">
            <div>
              <dt>참가 신청은 어떻게 하나요?</dt>
              <dd>
                이 페이지가 아닌 <Link href={`/marathon/${race.raceId}`}>DAI RUN 대회 상세 페이지</Link>에서만 접수돼요.
                정원이 찰 경우 자동으로 대기열에 등록되고, 자리가 나면 순서대로 확정돼요.
              </dd>
            </div>
            <div>
              <dt>참가비 환불 규정은요?</dt>
              <dd>대회 7일 전까지 신청 취소 시 전액 환불되며, 이후에는 환불이 제한될 수 있어요.</dd>
            </div>
            <div>
              <dt>기록 측정은 어떻게 이뤄지나요?</dt>
              <dd>배번에 부착된 RFID 칩으로 스타트·피니시 시점을 자동 기록하고, 완주 후 DAI RUN 앱 마이페이지에서 확인할 수 있어요.</dd>
            </div>
          </dl>
        </Card>

        <Card className="marathon-official-section">
          <h2>접수 현황</h2>
          {registrationWindow ? (
            <p className="marathon-official-registration">
              접수 기간:{' '}
              <strong>
                {formatKstDateTime(registrationWindow.opensAt, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </strong>{' '}
              ~{' '}
              <strong>
                {formatKstDateTime(registrationWindow.closesAt, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </strong>
            </p>
          ) : (
            <p className="muted">접수 일정이 아직 공지되지 않았어요.</p>
          )}
          {capacityStatus.capacity !== null && (
            <>
              <div className="progress" style={{ marginTop: 10 }}>
                <i style={{ width: `${Math.min(100, (capacityStatus.confirmedCount / capacityStatus.capacity) * 100)}%` }} />
              </div>
              <p className="muted">
                {capacityStatus.confirmedCount} / {capacityStatus.capacity}명 신청
                {capacityStatus.waitingCount > 0 && ` · 대기 ${capacityStatus.waitingCount}명`}
              </p>
            </>
          )}
          <Link href={`/marathon/${race.raceId}`} className="primary-btn full-width" style={{ marginTop: 12 }}>
            지금 신청하러 가기
          </Link>
        </Card>
      </div>
    </div>
  );
}
