import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LikedShoesSection } from '@/components/LikedShoesSection';
import { getUserLikedShoes } from '@/lib/shoes';

export const dynamic = 'force-dynamic';

export default async function LikedShoesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const shoes = userId ? await getUserLikedShoes(userId) : [];

  return (
    <div className="mypage-subpage">
      <Link href="/mypage" className="mypage-back-link">← 마이페이지</Link>
      <LikedShoesSection shoes={shoes} />
    </div>
  );
}
