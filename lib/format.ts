// getPool(서버 전용, fs 사용)을 import하지 않는 순수 포맷팅 유틸이라 클라이언트 컴포넌트에서도 쓸 수 있다.

// 리뷰 평균 등은 DB엔 정밀한 값을 저장하고, 화면에는 소수점 첫째 자리까지 "버림"으로만 보여준다
// (반올림 아님 — 예: 4.99 -> 4.9).
export function truncateToOneDecimal(value: number): number {
  return Math.floor(value * 10) / 10;
}
