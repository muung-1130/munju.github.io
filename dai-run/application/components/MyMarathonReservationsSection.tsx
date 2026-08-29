import Link from 'next/link';
import { Card } from '@/components/UI';

type MyReservation = {
  reservationId: string;
  raceId: number;
  raceName: string;
  raceDate: string | null;
  status: 'PENDING' | 'WAITING' | 'CONFIRMED' | 'REJECTED';
  submittedAt: string;
};

const STATUS_LABEL: Record<MyReservation['status'], string> = {
  PENDING: '신청 완료',
  WAITING: '대기 중',
  CONFIRMED: '확정',
  REJECTED: '반려됨'
};

function formatRaceDate(iso: string | null) {
  if (!iso) return '일정 미정';
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function MyMarathonReservationsSection({ reservations }: { reservations: MyReservation[] }) {
  return (
    <Card className="mypage-marathon-reservations-card">
      <div className="card-head">
        <h2>신청한 마라톤</h2>
      </div>
      {reservations.length === 0 ? (
        <p className="muted">아직 신청한 마라톤이 없어요. 마라톤 페이지에서 대회를 찾아보세요.</p>
      ) : (
        <div className="mypage-liked-shoes-list">
          {reservations.map((reservation) => (
            <div key={reservation.reservationId} className="mypage-liked-shoe-row">
              <div className="mypage-shoe-info">
                <Link href={`/marathon/${reservation.raceId}`} className="text-link">
                  <strong>{reservation.raceName}</strong>
                </Link>
                <span className="muted">
                  {formatRaceDate(reservation.raceDate)} · {STATUS_LABEL[reservation.status]}
                </span>
              </div>
              <Link href={`/marathon/${reservation.raceId}`} className="ghost-btn">
                상세 보기
              </Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
