import { Card } from '@/components/UI';
import type { MetricType } from '@/lib/challengeFormat';

type ChallengeWeeklyProgress = {
  challengeId: string;
  name: string;
  metricType: MetricType;
  progressRatio: number;
  days: { dayLabel: string; value: number; isToday: boolean }[];
};

export function MyChallengesSection({ challenges }: { challenges: ChallengeWeeklyProgress[] }) {
  return (
    <Card className="mypage-challenges-card">
      <div className="card-head">
        <h2>하고 있는 챌린지</h2>
        <span className="muted">오늘 달성 현황</span>
      </div>
      {challenges.length === 0 ? (
        <p className="muted">참여 중인 챌린지가 없어요.</p>
      ) : (
        <table className="mypage-challenges-table">
          <thead>
            <tr>
              <th>챌린지</th>
              <th>진행률</th>
              <th>오늘</th>
            </tr>
          </thead>
          <tbody>
            {challenges.map((challenge) => {
              const today = challenge.days.find((d) => d.isToday);
              const success = (today?.value ?? 0) > 0;
              return (
                <tr key={challenge.challengeId}>
                  <td>{challenge.name}</td>
                  <td>{challenge.progressRatio.toFixed(0)}%</td>
                  <td className="mypage-challenge-today-icon">
                    <span className={success ? 'today-ok' : 'today-miss'} title={success ? '오늘 진행했어요' : '오늘 기록이 아직 없어요'}>
                      {success ? '✅' : '⬜'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
