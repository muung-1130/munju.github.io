import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card, PageTitle } from '@/components/UI';
import { getShoeWearAnalyses } from '@/lib/shoes';

const STATUS_LABEL: Record<string, string> = { PENDING: '대기중', PROCESSING: '분석중', COMPLETED: '완료', FAILED: '실패' };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default async function ShoeWearAnalysisPage({ params }: { params: { userShoeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return (
      <div>
        <Link href="/mypage" className="back-link">← 마이페이지로</Link>
        <Card>로그인이 필요해요.</Card>
      </div>
    );
  }

  const data = await getShoeWearAnalyses(params.userShoeId, session.user.id);
  if (!data) {
    return (
      <div>
        <Link href="/mypage" className="back-link">← 마이페이지로</Link>
        <Card>신발을 찾을 수 없어요.</Card>
      </div>
    );
  }

  return (
    <div>
      <Link href="/mypage" className="back-link">← 마이페이지로</Link>
      <PageTitle title={`${data.shoeName} 마모도 분석`} subtitle="AI가 분석한 밑창 마모 기록이에요." />
      <Card>
        {data.analyses.length === 0 ? (
          <p className="muted">아직 마모도 분석 기록이 없어요. 신발 사진을 업로드하면 분석을 요청할 수 있어요.</p>
        ) : (
          <div className="wear-analysis-list">
            {data.analyses.map((analysis) => (
              <div key={analysis.wearAnalysisId} className="wear-analysis-row">
                <span className="type-pill">{STATUS_LABEL[analysis.status] ?? analysis.status}</span>
                <span className="muted">{formatDate(analysis.requestedAt)}</span>
                <span>종합 {analysis.wearScore ?? '-'}</span>
                <span>뒤꿈치 {analysis.heelWearScore ?? '-'}</span>
                <span>앞발 {analysis.forefootWearScore ?? '-'}</span>
                <span>밑창 {analysis.outsoleWearScore ?? '-'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
