'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

const DISMISS_KEY = 'runningPrefsOnboardingDismissed';

const GOAL_OPTIONS = [
  { value: 'HEALTH', label: '건강 관리' },
  { value: 'DIET', label: '다이어트' },
  { value: 'ENDURANCE', label: '지구력 향상' },
  { value: 'MARATHON', label: '마라톤 준비' }
];
const DIFFICULTY_OPTIONS = [
  { value: 'BEGINNER', label: '초급' },
  { value: 'INTERMEDIATE', label: '중급' },
  { value: 'ADVANCED', label: '고급' }
];
const DISTANCE_OPTIONS = [
  { value: 3000, label: '3km' },
  { value: 5000, label: '5km' },
  { value: 10000, label: '10km' },
  { value: 15000, label: '15km' },
  { value: 21000, label: '하프(21km)' }
];
const SCENERY_OPTIONS = [
  { value: '한강', label: '한강' },
  { value: '공원', label: '공원' },
  { value: '도심', label: '도심' },
  { value: '숲·트레일', label: '숲·트레일' },
  { value: '무관', label: '무관' }
];

export function RunningPreferencesOnboardingModal() {
  const { data: session } = useSession();
  const nickname = session?.user?.name ?? '러너';
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [scenery, setScenery] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    fetch('/api/user-running-preferences')
      .then((res) => (res.ok ? res.json() : { hasPreferences: true }))
      .then((data) => {
        if (!data.hasPreferences) setOpen(true);
      });
  }, [session?.user]);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setOpen(false);
  }

  async function submit() {
    setSubmitting(true);
    try {
      await fetch('/api/user-running-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runningGoal: goal, difficulty, preferredDistanceM: distanceM, preferredScenery: scenery })
      });
      sessionStorage.setItem(DISMISS_KEY, '1');
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="crew-chat-overlay" onClick={dismiss}>
      <div className="crew-detail-modal onboarding-pref-modal" onClick={(e) => e.stopPropagation()}>
        <div className="crew-chat-modal-head">
          <strong>잠깐! 정확한 코스 추천 기능을 위해 {nickname}님에 대한 몇 가지 정보를 얻고 싶어요.</strong>
          <button onClick={dismiss} aria-label="닫기">✕</button>
        </div>

        <p className="muted">버튼만 눌러도 돼요. 원하지 않는 항목은 건너뛸 수 있어요.</p>

        <label>러닝 목표</label>
        <div className="env-grid onboarding-pref-grid">
          {GOAL_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" className={goal === opt.value ? 'selected' : ''} onClick={() => setGoal(opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>

        <label>숙련도</label>
        <div className="env-grid onboarding-pref-grid">
          {DIFFICULTY_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" className={difficulty === opt.value ? 'selected' : ''} onClick={() => setDifficulty(opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>

        <label>선호 거리</label>
        <div className="env-grid onboarding-pref-grid">
          {DISTANCE_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" className={distanceM === opt.value ? 'selected' : ''} onClick={() => setDistanceM(opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>

        <label>선호 환경</label>
        <div className="env-grid onboarding-pref-grid">
          {SCENERY_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" className={scenery === opt.value ? 'selected' : ''} onClick={() => setScenery(opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="onboarding-pref-actions">
          <button className="ghost-btn" onClick={dismiss}>나중에 할게요</button>
          <button className="primary-btn" disabled={submitting} onClick={submit}>
            {submitting ? '저장하는 중...' : '완료'}
          </button>
        </div>
      </div>
    </div>
  );
}
