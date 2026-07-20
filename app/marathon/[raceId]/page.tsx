'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, PageTitle } from '@/components/UI';
import { useAuthModal } from '@/components/AuthModalContext';

type MarathonRace = {
  raceId: number;
  raceName: string;
  raceDate: string | null;
  registrationStartDate: string | null;
  registrationEndDate: string | null;
  souvenir: string | null;
  raceDistance: string;
  region: string | null;
  officialWebsite: string;
  isExclusiveCollab: boolean;
  capacity: number | null;
};

type RegistrationWindow = { opensAt: string; closesAt: string; status: string };
type CapacityStatus = { capacity: number | null; confirmedCount: number; waitingCount: number };
type MyReservation = { status: string; submittedAt: string };

const STATUS_POLL_MS = 5000;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function useCountdown(target: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);
  if (!target) return null;
  const diffMs = new Date(target).getTime() - now;
  if (diffMs <= 0) return null;
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return days > 0
    ? `${days}일 ${hours}시간 ${minutes}분 ${seconds}초`
    : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function MarathonDetailPage() {
  const params = useParams<{ raceId: string }>();
  const raceId = params.raceId;
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();

  const [race, setRace] = useState<MarathonRace | null | undefined>(undefined);
  const [registrationWindow, setRegistrationWindow] = useState<RegistrationWindow | null>(null);
  const [capacityStatus, setCapacityStatus] = useState<CapacityStatus | null>(null);
  const [myReservation, setMyReservation] = useState<MyReservation | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyOutcome, setApplyOutcome] = useState<{ status: string; queueSequenceNo: number | null } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/marathon/${raceId}`);
    if (!res.ok) {
      setRace(null);
      return;
    }
    const data = await res.json();
    setRace(data.race);
    setRegistrationWindow(data.registrationWindow);
    setCapacityStatus(data.capacityStatus);
    setMyReservation(data.myReservation);
  }, [raceId]);

  useEffect(() => {
    load();
  }, [load]);

  // 정원 현황은 신청 트랜잭션과 분리된 가벼운 조회라서, 접수창이 열려 있는 동안은 주기적으로
  // 다시 불러와 "얼마나 찼는지"를 실시간에 가깝게 보여준다 — 신청 버튼을 계속 눌러보는 대신
  // 이 화면만 보고 기다릴 수 있게 해서 무의미한 재시도성 신청 요청을 줄인다.
  useEffect(() => {
    if (!race?.isExclusiveCollab) return;
    const timer = setInterval(load, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [race?.isExclusiveCollab, load]);

  const countdown = useCountdown(registrationWindow && !applyOutcome ? registrationWindow.opensAt : null);
  const windowOpen = useMemo(() => {
    if (!registrationWindow) return true;
    const now = Date.now();
    return now >= new Date(registrationWindow.opensAt).getTime() && now <= new Date(registrationWindow.closesAt).getTime();
  }, [registrationWindow]);

  async function apply() {
    if (!session?.user) {
      openAuthModal();
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/marathon/${raceId}/apply`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '신청에 실패했어요.');
        return;
      }
      setApplyOutcome({ status: data.status, queueSequenceNo: data.queueSequenceNo });
      load();
    } finally {
      setApplying(false);
    }
  }

  async function cancel() {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/marathon/${raceId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '취소에 실패했어요.');
        return;
      }
      setApplyOutcome(null);
      setMyReservation(null);
      load();
    } finally {
      setApplying(false);
    }
  }

  if (race === undefined) return <p className="muted">불러오는 중...</p>;
  if (race === null) {
    return (
      <div>
        <Link href="/marathon" className="back-link">← 마라톤 목록으로</Link>
        <Card>대회를 찾을 수 없어요.</Card>
      </div>
    );
  }

  const alreadyApplied = !!myReservation && myReservation.status !== 'CANCELLED';
  const remainingSlots = capacityStatus?.capacity !== null && capacityStatus?.capacity !== undefined
    ? Math.max(0, capacityStatus.capacity - (capacityStatus?.confirmedCount ?? 0))
    : null;

  return (
    <div>
      <Link href="/marathon" className="back-link">← 마라톤 목록으로</Link>
      <PageTitle title={race.raceName} subtitle={race.isExclusiveCollab ? 'DAI RUN이 독점으로 접수를 진행하는 대회예요.' : undefined} />

      <Card className="marathon-detail-card">
        <div className="challenge-page-grid">
          <div className="challenge-detail-stat">
            <span className="muted">대회일</span>
            <strong>{race.raceDate ?? '미정'}</strong>
          </div>
          <div className="challenge-detail-stat">
            <span className="muted">거리</span>
            <strong>{race.raceDistance}</strong>
          </div>
          <div className="challenge-detail-stat">
            <span className="muted">지역</span>
            <strong>{race.region ?? '전국'}</strong>
          </div>
          <div className="challenge-detail-stat">
            <span className="muted">기념품</span>
            <strong>{race.souvenir ?? '없음'}</strong>
          </div>
          {registrationWindow && (
            <div className="challenge-detail-stat">
              <span className="muted">접수 기간</span>
              <strong>{formatDateTime(registrationWindow.opensAt)} ~ {formatDateTime(registrationWindow.closesAt)}</strong>
            </div>
          )}
          {capacityStatus && (
            <div className="challenge-detail-stat">
              <span className="muted">정원</span>
              <strong>{capacityStatus.confirmedCount}{capacityStatus.capacity !== null ? ` / ${capacityStatus.capacity}` : ''}명 신청{capacityStatus.waitingCount > 0 && ` · 대기 ${capacityStatus.waitingCount}명`}</strong>
            </div>
          )}
        </div>

        {capacityStatus?.capacity && (
          <div className="progress" style={{ marginTop: 16 }}>
            <i style={{ width: `${Math.min(100, (capacityStatus.confirmedCount / capacityStatus.capacity) * 100)}%` }} />
          </div>
        )}

        <a href={race.officialWebsite} target="_blank" rel="noreferrer" className="marathon-official-link" style={{ display: 'inline-block', marginTop: 12 }}>
          공식 홈페이지 ↗
        </a>
      </Card>

      {race.isExclusiveCollab && (
        <Card className="marathon-apply-card">
          {alreadyApplied || applyOutcome ? (
            <div className="marathon-apply-result">
              {(applyOutcome?.status ?? myReservation?.status) === 'CONFIRMED' ? (
                <p className="field-ok">🎉 신청이 확정됐어요! 대회 당일 뵐게요.</p>
              ) : (
                <p className="field-ok">
                  현재 대기열에 등록됐어요
                  {applyOutcome?.queueSequenceNo ? ` (대기 순번 ${applyOutcome.queueSequenceNo}번)` : ''}. 자리가 나면 자동으로 확정돼요.
                </p>
              )}
              <button className="ghost-btn full-width" disabled={applying} onClick={cancel}>
                {applying ? '취소 처리 중...' : '신청 취소하기'}
              </button>
            </div>
          ) : countdown ? (
            <div className="marathon-countdown">
              <span className="muted">접수 시작까지</span>
              <strong className="marathon-countdown-timer">{countdown}</strong>
              <p className="muted">정각에 정원이 빠르게 찰 수 있어요. 페이지를 열어둔 채로 기다려 주세요.</p>
            </div>
          ) : (
            <>
              {remainingSlots === 0 && <p className="muted">정원이 모두 찼어요. 신청하면 대기열에 등록돼요.</p>}
              <button className="primary-btn full-width" disabled={applying || !windowOpen} onClick={apply}>
                {applying ? '신청 처리 중...' : !windowOpen ? '접수 마감' : remainingSlots === 0 ? '대기열 신청하기' : '신청하기'}
              </button>
            </>
          )}
          {error && <p className="field-error">{error}</p>}
        </Card>
      )}
    </div>
  );
}
