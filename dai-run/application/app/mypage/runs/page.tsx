import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { RecentRunsTable } from '@/components/RecentRunsTable';
import { getRecentRunsDetailed } from '@/lib/runningRecord';

export const dynamic = 'force-dynamic';

export default async function MyRunsPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const runs = userId ? await getRecentRunsDetailed(userId) : [];

  return (
    <div className="mypage-subpage">
      <Link href="/mypage" className="mypage-back-link">← 마이페이지</Link>
      <RecentRunsTable runs={runs} />
    </div>
  );
}
