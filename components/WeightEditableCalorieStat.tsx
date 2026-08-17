'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function WeightEditableCalorieStat({ totalCalories, weightKg }: { totalCalories: number | null; weightKg: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(weightKg));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 20 || n > 250) {
      setError('20~250kg 사이로 입력해주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/weight', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightKg: n })
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '저장에 실패했어요.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stat-card weight-calorie-stat">
      <div className="stat-icon">🔥</div>
      <div>
        <span>누적 칼로리</span>
        <strong>{totalCalories !== null ? totalCalories.toLocaleString() : '-'}</strong>
        {totalCalories !== null && <em>kcal</em>}
        {editing ? (
          <div className="weight-edit-row">
            <input
              type="number"
              min="20"
              max="250"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
            <span>kg</span>
            <button type="button" className="weight-edit-save" disabled={saving} onClick={save}>
              저장
            </button>
            <button type="button" className="weight-edit-cancel" onClick={() => setEditing(false)}>
              취소
            </button>
          </div>
        ) : (
          <span className="weight-basis-note">
            ({weightKg}kg 기준)
            <button type="button" className="weight-edit-pencil" aria-label="몸무게 수정" onClick={() => setEditing(true)}>
              ✏️
            </button>
          </span>
        )}
        {error && <p className="field-error">{error}</p>}
      </div>
    </div>
  );
}
