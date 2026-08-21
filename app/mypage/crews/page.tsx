import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MyCrewsSection } from '@/components/MyCrewsSection';
import { getMyActiveCrews } from '@/lib/crew';

export const dynamic = 'force-dynamic';

export default async function MyCrewsPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const crews = userId ? await getMyActiveCrews(userId) : [];

  return (
    <div className="mypage-subpage">
      <Link href="/mypage" className="mypage-back-link">← 마이페이지</Link>
      <MyCrewsSection crews={crews} />
    </div>
  );
}
