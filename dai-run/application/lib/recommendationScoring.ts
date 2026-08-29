// dai-run-main/course-recommendation-ai의 app/scoring.py와 동일한 공식을 TypeScript로 미러링한다.
// 찜/인기 슬롯은 Bedrock을 다시 부르지 않고 여기서 직접 점수를 매기므로, 공식이 바뀌면 두 파일을
// 같이 수정해야 한다 (서로 참조는 안 하지만 로직은 동일하게 유지).

export type ScoreCandidate = {
  distanceM: number | null;
  difficulty: number | null; // 1~3
  description: string | null;
  region: string | null;
  viewCount: number;
  likeCount: number;
  reviewCount: number;
  reviewAverage: number;
};

export type ScorePreference = {
  preferredDistanceKm: number | null;
  difficulty: number | null; // 1~3
  preferredEnvironment: string | null;
};

export type ComputedScores = {
  score: number | null;
  distanceScore: number | null;
  difficultyScore: number | null;
  environmentScore: number | null;
  preferenceScore: number | null;
};

const MAX_DIFFICULTY_GAP = 2;

function distanceScore(candidate: ScoreCandidate, preference: ScorePreference): number | null {
  if (preference.preferredDistanceKm === null || candidate.distanceM === null) return null;
  const preferredM = preference.preferredDistanceKm * 1000;
  if (preferredM <= 0) return null;
  const gapRatio = Math.abs(candidate.distanceM - preferredM) / preferredM;
  return Math.round(Math.max(0, 100 - gapRatio * 100) * 1000) / 1000;
}

function difficultyScore(candidate: ScoreCandidate, preference: ScorePreference): number | null {
  if (preference.difficulty === null || candidate.difficulty === null) return null;
  const gap = Math.abs(candidate.difficulty - preference.difficulty);
  return Math.round(Math.max(0, 100 - (gap / MAX_DIFFICULTY_GAP) * 100) * 1000) / 1000;
}

function environmentScore(candidate: ScoreCandidate, preference: ScorePreference): number | null {
  if (!preference.preferredEnvironment || !candidate.description) return null;
  const haystack = `${candidate.description} ${candidate.region ?? ''}`;
  return haystack.includes(preference.preferredEnvironment) ? 100 : 40;
}

function popularity(candidate: ScoreCandidate): number {
  const ratingComponent = candidate.reviewCount > 0 ? candidate.reviewAverage : 0;
  return candidate.viewCount + candidate.likeCount * 2 + candidate.reviewCount * 2 + ratingComponent * 4;
}

function preferenceScore(candidate: ScoreCandidate, allCandidates: ScoreCandidate[]): number | null {
  if (allCandidates.length === 0) return null;
  const maxPopularity = Math.max(...allCandidates.map(popularity));
  if (maxPopularity <= 0) return null;
  return Math.round(Math.min(100, (popularity(candidate) / maxPopularity) * 100) * 1000) / 1000;
}

export function computeScores(
  selected: ScoreCandidate,
  preference: ScorePreference,
  allCandidates: ScoreCandidate[]
): ComputedScores {
  const dScore = distanceScore(selected, preference);
  const diffScore = difficultyScore(selected, preference);
  const eScore = environmentScore(selected, preference);
  const pScore = preferenceScore(selected, allCandidates);

  const subScores = [dScore, diffScore, eScore, pScore].filter((v): v is number => v !== null);
  const overall = subScores.length > 0 ? Math.round((subScores.reduce((a, b) => a + b, 0) / subScores.length) * 1000) / 1000 : null;

  return {
    score: overall,
    distanceScore: dScore,
    difficultyScore: diffScore,
    environmentScore: eScore,
    preferenceScore: pScore
  };
}
