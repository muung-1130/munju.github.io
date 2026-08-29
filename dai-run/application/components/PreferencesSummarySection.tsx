'use client';

import { Card } from '@/components/UI';
import { usePreferencesModal } from './PreferencesModalContext';
import type { RunningPreferences } from '@/lib/runningPreferences';

const GOAL_LABEL: Record<string, string> = {
  HEALTH: '건강 관리',
  DIET: '다이어트',
  ENDURANCE: '지구력 향상',
  MARATHON: '마라톤 준비'
};
const DIFFICULTY_LABEL: Record<string, string> = { BEGINNER: '초급', INTERMEDIATE: '중급', ADVANCED: '고급' };

function formatDistance(m: number | null): string {
  if (m === null) return '-';
  if (m % 1000 === 0) return `${m / 1000}km`;
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
}

export function PreferencesSummarySection({ preferences }: { preferences: RunningPreferences | null }) {
  const { openPreferencesModal } = usePreferencesModal();

  return (
    <Card className="mypage-preferences-card">
      <div className="card-head">
        <h2>러닝 선호도</h2>
        <button type="button" className="ghost-btn small" onClick={openPreferencesModal}>
          선호도 정보 {preferences ? '수정' : '추가'}
        </button>
      </div>
      <div className="mypage-preferences-grid">
        <div>
          <span className="muted">러닝 목표</span>
          <strong>{preferences?.runningGoal ? GOAL_LABEL[preferences.runningGoal] ?? preferences.runningGoal : '-'}</strong>
        </div>
        <div>
          <span className="muted">숙련도</span>
          <strong>{preferences?.difficulty ? DIFFICULTY_LABEL[preferences.difficulty] ?? preferences.difficulty : '-'}</strong>
        </div>
        <div>
          <span className="muted">선호 거리</span>
          <strong>{formatDistance(preferences?.preferredDistanceM ?? null)}</strong>
        </div>
        <div>
          <span className="muted">선호 환경</span>
          <strong>{preferences?.preferredScenery ?? '-'}</strong>
        </div>
      </div>
    </Card>
  );
}
