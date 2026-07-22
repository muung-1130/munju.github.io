import Link from 'next/link';
import { Card } from '@/components/UI';

type CompletedChallenge = {
  participationId: string;
  challengeId: string;
  name: string;
  challengeType: string;
  completedAt: string;
};

function formatCompletedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

export function CompletedChallengesSection({ challenges }: { challenges: CompletedChallenge[] }) {
  return (
    <Card className="mypage-completed-challenges-card">
      <div className="card-head">
        <h2>완료한 챌린지</h2>
      </div>
      {challenges.length === 0 ? (
        <p className="muted">아직 완료한 챌린지가 없어요.</p>
      ) : (
        <div className="completed-challenges-list">
          {challenges.map((challenge) => (
            <div key={challenge.participationId} className="completed-challenge-row">
              <Link href={`/challenges/${challenge.challengeId}`} className="mypage-challenge-name-link">
                {challenge.name}
              </Link>
              <span className="muted">{formatCompletedDate(challenge.completedAt)} 완료</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
