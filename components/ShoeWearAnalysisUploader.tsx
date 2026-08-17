'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/UI';
import { WEAR_ROLES, WearPhotoUploadGrid } from '@/components/WearPhotoUploadGrid';
import { WearAnalysisResponse, WearAnalysisResultView } from '@/components/WearAnalysisResultView';

export function ShoeWearAnalysisUploader({
  userShoeId,
  initialPurchaseDate
}: {
  userShoeId: string;
  initialPurchaseDate: string | null;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<Partial<Record<string, File>>>({});
  const [purchaseDate, setPurchaseDate] = useState(initialPurchaseDate ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WearAnalysisResponse | null>(null);

  const allSelected = WEAR_ROLES.every((role) => files[role]);

  function pickFile(role: string, file: File | undefined) {
    setFiles((prev) => ({ ...prev, [role]: file }));
  }

  async function submit() {
    if (!allSelected || !purchaseDate) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      for (const role of WEAR_ROLES) form.append(role, files[role] as File);
      form.append('purchase_date', purchaseDate);
      const res = await fetch(`/api/user-shoes/${userShoeId}/wear-analysis`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '분석 요청을 처리할 수 없어요.');
        return;
      }
      setResult(data);
      if (data.status === 'COMPLETED') {
        router.refresh();
      }
    } catch {
      setError('네트워크 오류로 분석 요청에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <Card className="wear-upload-card">
        <div className="wear-loading">
          <span className="wear-spinner" />
          <p>AI가 사진을 분석하고 있어요...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="wear-upload-card">
      <div className="card-head">
        <h2>사진으로 새로 분석하기</h2>
      </div>
      <p className="muted">
        밑창 전체(왼/오), 양쪽 뒤꿈치 정면, 바깥쪽 측면(왼/오) — 총 5장이 필요해요. AI가 사진을 확인해
        마모 단계와 잔여 수명을 추정해 드려요. 분석에는 10~20초 정도 걸려요.
      </p>

      <WearPhotoUploadGrid files={files} onPick={pickFile} />

      <label>구매일</label>
      <input
        type="date"
        value={purchaseDate}
        max={new Date().toISOString().slice(0, 10)}
        onClick={(event) => event.currentTarget.showPicker?.()}
        onChange={(event) => setPurchaseDate(event.target.value)}
      />

      <button className="primary-btn full-width" disabled={!allSelected || !purchaseDate} onClick={submit}>
        수명 분석 요청하기
      </button>

      {error && <p className="field-error">{error}</p>}

      {result && <WearAnalysisResultView result={result} userShoeId={userShoeId} />}
    </Card>
  );
}
