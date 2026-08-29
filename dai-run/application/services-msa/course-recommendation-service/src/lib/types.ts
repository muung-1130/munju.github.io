// components/AiRecoPanel.tsx(프론트) 소유의 응답 타입 계약. 이 서비스는 이 모양대로
// JSON을 내려주기만 하고, 실제 렌더링 컴포넌트를 참조하지 않는다.
export type AiRecoCourse = {
  recommendationId: string | null;
  courseId: string;
  name: string;
  distanceM: number;
  positions: [number, number][];
  rankNo?: number | null;
  slotLabel?: string | null;
  score?: number | null;
  distanceScore?: number | null;
  difficultyScore?: number | null;
  environmentScore?: number | null;
  preferenceScore?: number | null;
  reason?: string | null;
  createdAt?: string | null;
  modelVersion?: string | null;
  likedByUser?: boolean;
  likeCount?: number;
  isDefaultRecommendation?: boolean;
};
