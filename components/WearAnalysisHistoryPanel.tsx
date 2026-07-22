'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/UI';
import { WearAnalysisResponse, WearAnalysisResultView } from '@/components/WearAnalysisResultView';

type WearAnalysis = {
  wearAnalysisId: string;
  status: string;
  wearScore: number | null;
  heelWearScore: number | null;
  forefootWearScore: number | null;
  outsoleWearScore: number | null;
  requestedAt: string;
  completedAt: string | null;
};

const STATUS_LABEL: Record<string, string> = { PENDING: '대기중', PROCESSING: '분석중', COMPLETED: '완료', FAILED: '실패' };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function WearAnalysisHistoryPanel({ userShoeId, analyses }: { userShoeId: string; analyses: WearAnalysis[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<WearAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const latestCompleted = analyses.find((a) => a.status === 'COMPLETED');
    if (!latestCompleted) return;
    setSelectedId(latestCompleted.wearAnalysisId);
    setLoading(true);
    fetch(`/api/user-shoes/${userShoeId}/wear-analysis/latest`)
      .then((res) => (res.ok ? res.json() : { result: null }))
      .then((data) => setResult(data.result))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userShoeId]);

  async function viewAnalysis(wearAnalysisId: string) {
    if (selectedId === wearAnalysisId && result) return;
    setSelectedId(wearAnalysisId);
    setLoading(true);
    try {
      const res = await fetch(`/api/user-shoes/${userShoeId}/wear-analysis/${wearAnalysisId}`);
      const data = await res.json();
      setResult(res.ok ? data.result : null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {(loading || result) && (
        <Card className="wear-upload-card">
          <div className="card-head">
            <h2>분석 결과 다시보기</h2>
          </div>
          {loading ? <p className="muted">불러오는 중...</p> : result && <WearAnalysisResultView result={result} userShoeId={userShoeId} />}
        </Card>
      )}

      <Card>
        {analyses.length === 0 ? (
          <p className="muted">아직 마모도 분석 기록이 없어요. 신발 사진을 업로드하면 분석을 요청할 수 있어요.</p>
        ) : (
          <div className="wear-analysis-list">
            {analyses.map((analysis) => (
              <button
                key={analysis.wearAnalysisId}
                className={`wear-analysis-row ${selectedId === analysis.wearAnalysisId ? 'selected' : ''}`}
                onClick={() => analysis.status === 'COMPLETED' && viewAnalysis(analysis.wearAnalysisId)}
                disabled={analysis.status !== 'COMPLETED'}
              >
                <span className="type-pill">{STATUS_LABEL[analysis.status] ?? analysis.status}</span>
                <span className="muted">{formatDate(analysis.requestedAt)}</span>
                <span>종합 {analysis.wearScore ?? '-'}</span>
                <span>뒤꿈치 {analysis.heelWearScore ?? '-'}</span>
                <span>앞발 {analysis.forefootWearScore ?? '-'}</span>
                <span>밑창 {analysis.outsoleWearScore ?? '-'}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
