import Link from 'next/link';
import { Card } from '@/components/UI';
import { formatMetricValue, type MetricType } from '@/lib/challengeFormat';

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
        <span className="muted">최근 7일 달성 현황</span>
      </div>
      {challenges.length === 0 ? (
        <p className="muted">참여 중인 챌린지가 없어요.</p>
      ) : (
        <div className="mypage-challenges-table-wrap">
          <table className="mypage-challenges-table">
            <thead>
              <tr>
                <th>챌린지</th>
                <th>진행률</th>
                {challenges[0].days.map((d) => (
                  <th key={d.dayLabel} className={d.isToday ? 'is-today' : undefined}>
                    {d.dayLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {challenges.map((challenge) => (
                <tr key={challenge.challengeId}>
                  <td>
                    <Link href={`/challenges/${challenge.challengeId}`} className="mypage-challenge-name-link">
                      {challenge.name}
                    </Link>
                  </td>
                  <td>{challenge.progressRatio.toFixed(0)}%</td>
                  {challenge.days.map((d) => (
                    <td key={d.dayLabel} className={`mypage-challenge-day-cell ${d.isToday ? 'is-today' : ''}`}>
                      {d.value > 0 ? formatMetricValue(challenge.metricType, d.value) : <span className="muted">-</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
