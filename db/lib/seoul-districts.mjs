// lib/region.ts와 동일한 표(서울 25개 자치구 nx,ny). 값의 출처/검증 방법은 lib/region.ts 주석 참고.
// Next 앱 쪽 TS 코드와 이 순수 Node 스크립트 쪽에서 같은 값을 각각 보관한다(데이터 자체가
// 거의 바뀌지 않아 중복 허용).
export const SEOUL_DISTRICTS = [
  { name: '강남구', nx: 61, ny: 125 },
  { name: '강동구', nx: 63, ny: 126 },
  { name: '강북구', nx: 60, ny: 128 },
  { name: '강서구', nx: 57, ny: 127 },
  { name: '관악구', nx: 59, ny: 125 },
  { name: '광진구', nx: 62, ny: 126 },
  { name: '구로구', nx: 58, ny: 125 },
  { name: '금천구', nx: 59, ny: 124 },
  { name: '노원구', nx: 61, ny: 129 },
  { name: '도봉구', nx: 61, ny: 129 },
  { name: '동대문구', nx: 61, ny: 127 },
  { name: '동작구', nx: 59, ny: 125 },
  { name: '마포구', nx: 59, ny: 127 },
  { name: '서대문구', nx: 59, ny: 127 },
  { name: '서초구', nx: 61, ny: 125 },
  { name: '성동구', nx: 61, ny: 126 },
  { name: '성북구', nx: 60, ny: 128 },
  { name: '송파구', nx: 62, ny: 125 },
  { name: '양천구', nx: 58, ny: 126 },
  { name: '영등포구', nx: 59, ny: 126 },
  { name: '용산구', nx: 60, ny: 126 },
  { name: '은평구', nx: 59, ny: 128 },
  { name: '종로구', nx: 60, ny: 127 },
  { name: '중구', nx: 60, ny: 127 },
  { name: '중랑구', nx: 62, ny: 127 }
];
