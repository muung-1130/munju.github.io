// [EKS / CloudNativePG 전용] 행정안전부 법정동코드 전체자료(EUC-KR, CRLF,
// "법정동코드\t법정동명\t폐지여부" TSV)를 course.legal_dong_codes(db/045)에 적재하기 위한 SQL
// 파일을 만든다.
//
// EKS 워커 노드에는 인터넷 아웃바운드가 없고(scripts/apply-environment-checkpoint-schema-eks.sh
// 주석 참고), CloudNativePG Pod는 클러스터 밖에서 TCP로 직접 못 붙는다 — kubectl exec로만
// 도달 가능하다. db/ingest-legal-dong-codes.mjs(pg.Client로 직접 접속)를 그대로 못 쓰는 이유다.
// 이 스크립트는 Postgres에 접속하지 않고 파일만 읽어서 COPY 기반 SQL을 만들어내고, 그 파일을
// 기존 kubectl exec 경로로 흘려보내는 두 단계로 나눈다.
//
// 실행:
//   node db/generate-legal-dong-codes-sql.mjs ["/path/to/법정동코드 전체자료.txt"] ["출력.sql"]
//   bash scripts/apply-environment-checkpoint-schema-eks.sh <출력.sql>
//
// 인자를 생략하면 입력은 "/home/kevin/법정동코드 전체자료.txt", 출력은
// "/tmp/legal-dong-codes-data.sql"을 쓴다. 여러 번 실행해도 안전하다(TRUNCATE 후 재적재 —
// 이 테이블은 legal_dong_codes 전용 참조 데이터라 다른 데이터와 섞이지 않는다).
import { readFileSync, writeFileSync } from 'node:fs';

const inputPath = process.argv[2] ?? '/home/kevin/법정동코드 전체자료.txt';
const outputPath = process.argv[3] ?? '/tmp/legal-dong-codes-data.sql';

function escapeCopyField(value) {
  if (value === null) return '\\N';
  return String(value).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function parseRows(filePath) {
  const buf = readFileSync(filePath);
  const text = new TextDecoder('euc-kr').decode(buf);
  const lines = text.split('\r\n').filter((line) => line.length > 0);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const [code, fullName, status] = lines[i].split('\t');
    if (!code || !fullName || !status) {
      throw new Error(`${i + 1}번째 줄 형식이 예상과 다릅니다: ${JSON.stringify(lines[i])}`);
    }

    const tokens = fullName.split(' ').filter(Boolean);
    const sido = tokens[0];
    const sigungu = tokens.length >= 3 ? tokens.slice(1, -1).join(' ') : null;
    const dong = tokens.length >= 2 ? tokens[tokens.length - 1] : null;

    rows.push({ code, sido, sigungu, dong, fullName, isActive: status === '존재' });
  }
  return rows;
}

const rows = parseRows(inputPath);
console.log(`${inputPath} 파싱 완료: ${rows.length}건 (활성 ${rows.filter((r) => r.isActive).length}건 / 폐지 ${rows.filter((r) => !r.isActive).length}건)`);

const sqlLines = [
  'BEGIN;',
  '-- 참조 테이블 전체 재적재. 다른 데이터와 섞이지 않는 전용 테이블이라 TRUNCATE 후 통째로 다시 채운다.',
  'TRUNCATE TABLE course.legal_dong_codes;',
  'COPY course.legal_dong_codes (code, sido, sigungu, dong, full_name, is_active) FROM STDIN;'
];
for (const row of rows) {
  sqlLines.push(
    [
      escapeCopyField(row.code),
      escapeCopyField(row.sido),
      escapeCopyField(row.sigungu),
      escapeCopyField(row.dong),
      escapeCopyField(row.fullName),
      row.isActive ? 't' : 'f'
    ].join('\t')
  );
}
sqlLines.push('\\.');
sqlLines.push('COMMIT;');

writeFileSync(outputPath, sqlLines.join('\n') + '\n', 'utf8');
console.log(`SQL 파일 작성 완료: ${outputPath}`);
console.log(`다음 실행: bash scripts/apply-environment-checkpoint-schema-eks.sh ${outputPath}`);
