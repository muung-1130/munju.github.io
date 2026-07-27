// Running Record 서비스가 소유한 이벤트 payload 타입. Challenge 서비스는 이 타입을 컴파일
// 타임 계약으로만 쓰고(런타임 의존 없음), 실제 이벤트는 Running Record가 발행한다.
export type RunCompletedEventPayload = {
  runId: string;
  userId: string;
  courseId: string | null;
  myShoeId: string | null;
  sourceType: string;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  distanceM: number;
  durationSec: number | null;
  movingDurationSec: number | null;
  averagePaceSecPerKm: number | null;
  bestPaceSecPerKm: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
};
