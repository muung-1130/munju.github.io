import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card, PageTitle } from '@/components/UI';
import { getShoeWearAnalyses } from '@/lib/shoes';
import { WearAnalysisHistoryPanel } from '@/components/WearAnalysisHistoryPanel';
import { RetireShoeButton } from '@/components/RetireShoeButton';

export default async function ShoeWearAnalysisPage({ params }: { params: { userShoeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return (
      <div>
        <Link href="/shoes?tab=life" className="back-link">← 러닝화 수명예측으로</Link>
        <Card>로그인이 필요해요.</Card>
      </div>
    );
  }

  const data = await getShoeWearAnalyses(params.userShoeId, session.user.id);
  if (!data) {
    return (
      <div>
        <Link href="/shoes?tab=life" className="back-link">← 러닝화 수명예측으로</Link>
        <Card>신발을 찾을 수 없어요.</Card>
      </div>
    );
  }

  return (
    <div>
      <Link href="/shoes?tab=life" className="back-link">← 러닝화 수명예측으로</Link>
      <PageTitle
        title={`${data.shoeName} 마모도 분석`}
        subtitle="AI가 분석한 밑창 마모 기록이에요."
        action={data.status !== 'RETIRED' ? <RetireShoeButton userShoeId={params.userShoeId} /> : undefined}
      />
      <WearAnalysisHistoryPanel userShoeId={params.userShoeId} analyses={data.analyses} />
    </div>
  );
}
