'use client';

import { useEffect, useState } from 'react';
import { WEAR_ROLES, WearPhotoUploadGrid } from '@/components/WearPhotoUploadGrid';
import { WearAnalysisResponse, WearAnalysisResultView } from '@/components/WearAnalysisResultView';

type CatalogOption = { shoeId: number; shoeName: string; brandName: string; imageUrl: string };

// 등록(create)/수정(edit) 겸용 모달. 등록 시엔 사진 5장이 필수(그 자리에서 AI 수명 예측까지
// 이어서 보여줌), 수정 시엔 선택(다시 분석하고 싶을 때만 5장 모두 올리면 재분석).
export function ShoeFormModal({
  mode,
  userShoeId,
  onClose,
  onDone
}: {
  mode: 'create' | 'edit';
  userShoeId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loadingExisting, setLoadingExisting] = useState(mode === 'edit');
  const [modelQuery, setModelQuery] = useState('');
  const [modelOptions, setModelOptions] = useState<CatalogOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<CatalogOption | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [noModel, setNoModel] = useState(false);
  const [nickname, setNickname] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [files, setFiles] = useState<Partial<Record<string, File>>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WearAnalysisResponse | null>(null);
  const [savedShoeId, setSavedShoeId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (mode !== 'edit' || !userShoeId) return;
    fetch(`/api/user-shoes/${userShoeId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.shoe) return;
        const shoe = data.shoe;
        if (shoe.shoeModelId === null) {
          setNoModel(true);
        } else {
          setSelectedModel({ shoeId: shoe.shoeModelId, shoeName: shoe.shoeName, brandName: shoe.brandName, imageUrl: shoe.imageUrl });
        }
        setNickname(shoe.nickname ?? '');
        setPurchaseDate(shoe.purchaseDate ?? '');
      })
      .finally(() => setLoadingExisting(false));
  }, [mode, userShoeId]);

  useEffect(() => {
    if (noModel) return;
    const timer = setTimeout(() => {
      fetch(`/api/shoes/catalog-search?q=${encodeURIComponent(modelQuery)}`)
        .then((res) => (res.ok ? res.json() : { shoes: [] }))
        .then((data) => setModelOptions(data.shoes ?? []));
    }, 200);
    return () => clearTimeout(timer);
  }, [modelQuery, noModel]);

  function pickFile(role: string, file: File | undefined) {
    setFiles((prev) => ({ ...prev, [role]: file }));
  }

  const allPhotosSelected = WEAR_ROLES.every((role) => files[role]);
  const anyPhotoSelected = WEAR_ROLES.some((role) => files[role]);
  const photosValid = mode === 'create' ? allPhotosSelected : !anyPhotoSelected || allPhotosSelected;

  async function submit() {
    setError(null);
    if (!noModel && !selectedModel) return setError('러닝화 모델을 검색해서 선택하거나, "모델을 선택하지 않음"을 체크해 주세요.');
    if (noModel && !nickname.trim()) return setError('모델을 선택하지 않은 경우 이름을 꼭 입력해 주세요.');
    if (!purchaseDate) return setError('구매일을 선택해 주세요.');
    if (mode === 'create' && !allPhotosSelected) return setError('수명 예측을 위해 사진 5장을 모두 올려주세요.');
    if (mode === 'edit' && anyPhotoSelected && !allPhotosSelected) return setError('재분석하려면 사진 5장을 모두 올려주세요.');

    setSubmitting(true);
    try {
      const payload = {
        shoeModelId: noModel ? null : selectedModel!.shoeId,
        nickname: nickname || null,
        purchaseDate
      };

      let targetShoeId = userShoeId;
      if (mode === 'create') {
        const res = await fetch('/api/user-shoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? '러닝화를 등록할 수 없어요.');
          return;
        }
        targetShoeId = data.userShoeId;
      } else {
        const res = await fetch(`/api/user-shoes/${userShoeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? '러닝화를 수정할 수 없어요.');
          return;
        }
      }
      setSavedShoeId(targetShoeId ?? null);

      if (mode === 'create' || anyPhotoSelected) {
        const form = new FormData();
        for (const role of WEAR_ROLES) form.append(role, files[role] as File);
        form.append('purchase_date', purchaseDate);
        const analysisRes = await fetch(`/api/user-shoes/${targetShoeId}/wear-analysis`, { method: 'POST', body: form });
        const analysisData = await analysisRes.json();
        if (analysisRes.ok) {
          setResult(analysisData);
        } else {
          setError(analysisData.error ?? '등록은 됐지만 수명 분석에 실패했어요.');
        }
      }
      setSaved(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="crew-chat-overlay" onClick={onClose}>
      <div className="crew-detail-modal shoe-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="crew-chat-modal-head">
          <strong>{mode === 'create' ? '러닝화 추가' : '러닝화 수정'}</strong>
          <button onClick={onClose} aria-label="닫기">✕</button>
        </div>

        {loadingExisting ? (
          <p className="muted">불러오는 중...</p>
        ) : submitting ? (
          <div className="wear-loading">
            <span className="wear-spinner" />
            <p>AI가 사진을 분석하고 있어요...</p>
          </div>
        ) : saved ? (
          <>
            {result && savedShoeId ? (
              <WearAnalysisResultView result={result} userShoeId={savedShoeId} />
            ) : (
              <p className="field-ok">저장했어요.</p>
            )}
            <div className="onboarding-pref-actions">
              <button className="primary-btn full-width" onClick={onDone}>
                목록보기
              </button>
            </div>
          </>
        ) : (
          <>
            <label>러닝화 모델</label>
            <div className="shoe-model-picker">
              <input
                value={selectedModel ? `${selectedModel.brandName} ${selectedModel.shoeName}` : modelQuery}
                disabled={noModel}
                onChange={(event) => {
                  setSelectedModel(null);
                  setModelQuery(event.target.value);
                  setModelDropdownOpen(true);
                }}
                onFocus={() => setModelDropdownOpen(true)}
                placeholder="브랜드 또는 모델명 검색"
              />
              {modelDropdownOpen && !selectedModel && !noModel && modelOptions.length > 0 && (
                <ul className="shoe-model-dropdown">
                  {modelOptions.map((opt) => (
                    <li
                      key={opt.shoeId}
                      onClick={() => {
                        setSelectedModel(opt);
                        setModelDropdownOpen(false);
                      }}
                    >
                      <img src={opt.imageUrl} alt="" />
                      <span>{opt.brandName} {opt.shoeName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="crew-filter-toggle" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={noModel}
                onChange={(event) => {
                  setNoModel(event.target.checked);
                  setSelectedModel(null);
                  setModelQuery('');
                }}
              />
              <span>모델을 선택하지 않음 (목록에 없는 러닝화)</span>
            </label>

            <label>{noModel ? '이름' : '별명 (선택)'}</label>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={noModel ? '예: 알 수 없는 트레일화' : '예: 평일 러닝화'}
            />
            {noModel && <p className="muted" style={{ marginTop: 4 }}>썸네일은 아래에서 올리는 측면 사진으로 자동 설정돼요.</p>}

            <label>구매일</label>
            <input
              type="date"
              value={purchaseDate}
              max={new Date().toISOString().slice(0, 10)}
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => setPurchaseDate(event.target.value)}
            />

            <label style={{ marginTop: 16 }}>
              수명 예측 사진 {mode === 'edit' && <span className="muted">(선택 — 다시 분석하려면 5장 모두 올려주세요)</span>}
            </label>
            <WearPhotoUploadGrid files={files} onPick={pickFile} />

            {error && <p className="field-error">{error}</p>}
            <button className="primary-btn full-width" disabled={submitting || !photosValid} onClick={submit} style={{ marginTop: 14 }}>
              {submitting ? '처리 중...' : mode === 'create' ? '등록하고 수명 예측 보기' : '저장하기'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
