// course.courses.difficulty(1/2/3) 표기/색상 매핑. lib/db(서버 전용, fs 사용)를 import하지 않는
// 순수 상수 모듈이라 클라이언트 컴포넌트에서도 안전하게 쓸 수 있다.
export const DIFFICULTY_LABEL: Record<number, string> = {
  1: '쉬움',
  2: '보통',
  3: '어려움'
};

export const DIFFICULTY_COLOR: Record<number, string> = {
  1: '#3aa655', // 쉬움 - 초록
  2: '#1259ee', // 보통 - 파랑
  3: '#e5484d' // 어려움 - 빨강
};
