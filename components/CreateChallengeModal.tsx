'use client';

import { useState } from 'react';
import type { MetricType } from '@/lib/challengeFormat';

const METRIC_OPTIONS: { value: MetricType; label: string }[] = [
  { value: 'DISTANCE', label: '거리 (km)' },
  { value: 'COUNT', label: '횟수 (회)' },
  { value: 'PACE', label: '페이스' },
  { value: 'STREAK', label: '연속일 (일)' }
];

const SOURCE_TYPE_OPTIONS = [
  { value: 'APP', label: '앱' },
  { value: 'WATCH', label: '워치' },
  { value: 'MANUAL', label: '수동 입력' }
];

function paceToSec(min: string, sec: string): number | undefined {
  if (min === '' && sec === '') return undefined;
  return (Number(min) || 0) * 60 + (Number(sec) || 0);
}

export function CreateChallengeModal({
  defaultType,
  onClose,
  onCreated
}: {
  defaultType: 'PUBLIC' | 'PERSONAL';
  onClose: () => void;
  onCreated: (challengeId: string) => void;
}) {
  const [challengeType, setChallengeType] = useState<'PUBLIC' | 'PERSONAL'>(defaultType);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [metricType, setMetricType] = useState<MetricType>('DISTANCE');
  const [targetValue, setTargetValue] = useState('');
  const [targetPaceMin, setTargetPaceMin] = useState('');
  const [targetPaceSec, setTargetPaceSec] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [useRules, setUseRules] = useState(false);

  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [minDistanceKm, setMinDistanceKm] = useState('');
  const [maxDistanceKm, setMaxDistanceKm] = useState('');
  const [minPaceMin, setMinPaceMin] = useState('');
  const [minPaceSec, setMinPaceSec] = useState('');
  const [maxPaceMin, setMaxPaceMin] = useState('');
  const [maxPaceSec, setMaxPaceSec] = useState('');
  const [minDurationMin, setMinDurationMin] = useState('');
  const [maxDurationMin, setMaxDurationMin] = useState('');
  const [minHr, setMinHr] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [minCadence, setMinCadence] = useState('');
  const [minElevation, setMinElevation] = useState('');
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleSourceType(value: string) {
    setSourceTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('챌린지 이름을 입력해 주세요.');
    if (!startAt || !endAt) return setError('시작일과 종료일을 입력해 주세요.');

    let finalTargetValue: number;
    if (metricType === 'PACE') {
      const sec = paceToSec(targetPaceMin, targetPaceSec);
      if (!sec) return setError('목표 페이스를 입력해 주세요.');
      finalTargetValue = sec;
    } else {
      finalTargetValue = Number(targetValue);
      if (!(finalTargetValue > 0)) return setError('목표값을 입력해 주세요.');
    }

    let rules: Record<string, unknown> | null = null;
    if (useRules) {
      rules = {};
      if (enabled.minDistance && minDistanceKm) rules.minDistanceM = Math.round(Number(minDistanceKm) * 1000);
      if (enabled.maxDistance && maxDistanceKm) rules.maxDistanceM = Math.round(Number(maxDistanceKm) * 1000);
      if (enabled.minPace) {
        const v = paceToSec(minPaceMin, minPaceSec);
        if (v) rules.minPaceSecPerKm = v;
      }
      if (enabled.maxPace) {
        const v = paceToSec(maxPaceMin, maxPaceSec);
        if (v) rules.maxPaceSecPerKm = v;
      }
      if (enabled.minDuration && minDurationMin) rules.minDurationSec = Math.round(Number(minDurationMin) * 60);
      if (enabled.maxDuration && maxDurationMin) rules.maxDurationSec = Math.round(Number(maxDurationMin) * 60);
      if (enabled.minHr && minHr) rules.minAvgHeartRate = Number(minHr);
      if (enabled.maxHr && maxHr) rules.maxAvgHeartRate = Number(maxHr);
      if (enabled.minCadence && minCadence) rules.minAvgCadence = Number(minCadence);
      if (enabled.minElevation && minElevation) rules.minElevationGainM = Number(minElevation);
      if (sourceTypes.length > 0) rules.allowedSourceTypes = sourceTypes;

      if (Object.keys(rules).length === 0) {
        return setError('세부 조건을 사용하려면 최소 한 가지 항목은 채워야 해요.');
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeType,
          name,
          description: description || null,
          metricType,
          targetValue: finalTargetValue,
          startAt,
          endAt,
          rules
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '챌린지를 만들 수 없어요.');
        return;
      }
      onCreated(data.challengeId);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="crew-chat-overlay" onClick={onClose}>
      <div className="crew-detail-modal" style={{ width: 520, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="crew-chat-modal-head">
          <strong>챌린지 만들기</strong>
          <button onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <label>챌린지 유형</label>
        <div className="env-grid foot-type-grid">
          <button type="button" className={challengeType === 'PUBLIC' ? 'selected' : ''} onClick={() => setChallengeType('PUBLIC')}>
            공개
          </button>
          <button type="button" className={challengeType === 'PERSONAL' ? 'selected' : ''} onClick={() => setChallengeType('PERSONAL')}>
            개인
          </button>
        </div>

        <label>챌린지 이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 7월 100km 달리기" maxLength={150} />

        <label>설명 (선택)</label>
        <textarea className="review-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />

        <label>목표 지표</label>
        <div className="env-grid foot-type-grid">
          {METRIC_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" className={metricType === opt.value ? 'selected' : ''} onClick={() => setMetricType(opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>

        {metricType === 'PACE' ? (
          <>
            <label>목표 페이스 (분'초"/km)</label>
            <div className="budget-row">
              <input type="number" min="0" placeholder="분" value={targetPaceMin} onChange={(e) => setTargetPaceMin(e.target.value)} />
              <span>'</span>
              <input type="number" min="0" max="59" placeholder="초" value={targetPaceSec} onChange={(e) => setTargetPaceSec(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <label>목표값</label>
            <input type="number" min="0" step="0.1" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
          </>
        )}

        <div className="budget-row">
          <div style={{ flex: 1 }}>
            <label>시작일</label>
            <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>종료일</label>
            <input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} min={startAt} />
          </div>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>참여 신청은 시작일 바로 전날에만 할 수 있어요.</p>

        <label className="crew-filter-toggle" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={useRules} onChange={(e) => setUseRules(e.target.checked)} />
          <span>세부 달성 조건 설정하기 (선택)</span>
        </label>

        {useRules && (
          <div className="challenge-rules-form">
            <div className="challenge-rule-row">
              <label><input type="checkbox" checked={!!enabled.minDistance} onChange={() => toggle('minDistance')} /> 최소 거리(km)</label>
              <input type="number" min="0" disabled={!enabled.minDistance} value={minDistanceKm} onChange={(e) => setMinDistanceKm(e.target.value)} />
              <label><input type="checkbox" checked={!!enabled.maxDistance} onChange={() => toggle('maxDistance')} /> 최대 거리(km)</label>
              <input type="number" min="0" disabled={!enabled.maxDistance} value={maxDistanceKm} onChange={(e) => setMaxDistanceKm(e.target.value)} />
            </div>
            <div className="challenge-rule-row">
              <label><input type="checkbox" checked={!!enabled.minPace} onChange={() => toggle('minPace')} /> 최소 페이스</label>
              <div className="budget-row">
                <input type="number" min="0" disabled={!enabled.minPace} placeholder="분" value={minPaceMin} onChange={(e) => setMinPaceMin(e.target.value)} />
                <input type="number" min="0" max="59" disabled={!enabled.minPace} placeholder="초" value={minPaceSec} onChange={(e) => setMinPaceSec(e.target.value)} />
              </div>
              <label><input type="checkbox" checked={!!enabled.maxPace} onChange={() => toggle('maxPace')} /> 최대 페이스</label>
              <div className="budget-row">
                <input type="number" min="0" disabled={!enabled.maxPace} placeholder="분" value={maxPaceMin} onChange={(e) => setMaxPaceMin(e.target.value)} />
                <input type="number" min="0" max="59" disabled={!enabled.maxPace} placeholder="초" value={maxPaceSec} onChange={(e) => setMaxPaceSec(e.target.value)} />
              </div>
            </div>
            <div className="challenge-rule-row">
              <label><input type="checkbox" checked={!!enabled.minDuration} onChange={() => toggle('minDuration')} /> 최소 시간(분)</label>
              <input type="number" min="0" disabled={!enabled.minDuration} value={minDurationMin} onChange={(e) => setMinDurationMin(e.target.value)} />
              <label><input type="checkbox" checked={!!enabled.maxDuration} onChange={() => toggle('maxDuration')} /> 최대 시간(분)</label>
              <input type="number" min="0" disabled={!enabled.maxDuration} value={maxDurationMin} onChange={(e) => setMaxDurationMin(e.target.value)} />
            </div>
            <div className="challenge-rule-row">
              <label><input type="checkbox" checked={!!enabled.minHr} onChange={() => toggle('minHr')} /> 최소 평균 심박수</label>
              <input type="number" min="0" disabled={!enabled.minHr} value={minHr} onChange={(e) => setMinHr(e.target.value)} />
              <label><input type="checkbox" checked={!!enabled.maxHr} onChange={() => toggle('maxHr')} /> 최대 평균 심박수</label>
              <input type="number" min="0" disabled={!enabled.maxHr} value={maxHr} onChange={(e) => setMaxHr(e.target.value)} />
            </div>
            <div className="challenge-rule-row">
              <label><input type="checkbox" checked={!!enabled.minCadence} onChange={() => toggle('minCadence')} /> 최소 평균 케이던스</label>
              <input type="number" min="0" disabled={!enabled.minCadence} value={minCadence} onChange={(e) => setMinCadence(e.target.value)} />
              <label><input type="checkbox" checked={!!enabled.minElevation} onChange={() => toggle('minElevation')} /> 최소 고도 상승(m)</label>
              <input type="number" min="0" disabled={!enabled.minElevation} value={minElevation} onChange={(e) => setMinElevation(e.target.value)} />
            </div>
            <div className="challenge-rule-row">
              <span style={{ fontWeight: 800 }}>허용 기록 출처</span>
              <div className="crew-filter-toggle" style={{ display: 'flex', gap: 12 }}>
                {SOURCE_TYPE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="crew-filter-toggle">
                    <input type="checkbox" checked={sourceTypes.includes(opt.value)} onChange={() => toggleSourceType(opt.value)} />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p className="field-error">{error}</p>}
        <button className="primary-btn full-width" disabled={submitting} onClick={submit} style={{ marginTop: 14 }}>
          {submitting ? '만드는 중...' : '챌린지 만들기'}
        </button>
      </div>
    </div>
  );
}
