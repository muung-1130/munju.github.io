// getPool(서버 전용, fs 사용)을 import하지 않는 순수 포맷팅 유틸이라 클라이언트 컴포넌트에서도 쓸 수 있다.

// 리뷰 평균 등은 DB엔 정밀한 값을 저장하고, 화면에는 소수점 첫째 자리까지 "버림"으로만 보여준다
// (반올림 아님 — 예: 4.99 -> 4.9).
export function truncateToOneDecimal(value: number): number {
  return Math.floor(value * 10) / 10;
}

const KST_TIME_ZONE = 'Asia/Seoul';

// 서버(Docker 컨테이너, TZ=UTC)와 사용자 브라우저의 타임존이 다르면 표시 시각 자체가 어긋나고,
// 그 위에 Node와 브라우저의 ICU 데이터 버전 차이 때문에 오전/오후 표기가 서버는 "PM", 클라이언트는
// "오후"로 서로 달라져 hydration mismatch(#425)를 일으킨다. timeZone을 Asia/Seoul로 고정하고
// 영어 AM/PM 표기를 한국어로 정규화해서 서버와 클라이언트가 항상 같은 문자열을 내도록 한다.
export function formatKstDateTime(iso: string, options: Intl.DateTimeFormatOptions): string {
  const formatted = new Date(iso).toLocaleString('ko-KR', { ...options, timeZone: KST_TIME_ZONE });
  return formatted.replace('AM', '오전').replace('PM', '오후');
}

export function formatKstDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString('ko-KR', { ...options, timeZone: KST_TIME_ZONE });
}
