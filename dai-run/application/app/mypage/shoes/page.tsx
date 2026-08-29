import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ShoesSection } from '@/components/ShoesSection';
import { getUserShoesDetailed } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

export default async function MyShoesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const shoes = userId ? await getUserShoesDetailed(userId) : [];

  return (
    <div className="mypage-subpage">
      <Link href="/mypage" className="mypage-back-link">← 마이페이지</Link>
      <ShoesSection shoes={shoes} />
    </div>
  );
}
