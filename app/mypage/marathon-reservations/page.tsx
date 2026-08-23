import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MyMarathonReservationsSection } from '@/components/MyMarathonReservationsSection';
import { getMyMarathonReservations } from '@/lib/marathon';

export const dynamic = 'force-dynamic';

export default async function MyMarathonReservationsPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const reservations = userId ? await getMyMarathonReservations(userId) : [];

  return (
    <div className="mypage-subpage">
      <Link href="/mypage" className="mypage-back-link">← 마이페이지</Link>
      <MyMarathonReservationsSection reservations={reservations} />
    </div>
  );
}
