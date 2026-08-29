// frontend 역할 인스턴스는 /api/*를 쓸 수 없으므로(middleware.ts 참고), DB·외부 API 호출이 없는
// 정적 페이지로 별도 헬스체크 경로를 둔다. 홈(/)은 코스 추천 등 SSR 데이터 조회가 있어 헬스체크로 쓰기엔 무겁다.
export default function HealthzPage() {
  return 'ok';
}
