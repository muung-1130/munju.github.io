// [로컬 / Docker Compose 전용] 행정안전부 법정동코드 전체자료(EUC-KR, CRLF,
// "법정동코드\t법정동명\t폐지여부" TSV)를 course.legal_dong_codes(db/045)에 적재한다.
// 이 스크립트는 .env의 PGHOST로 Postgres에 직접 TCP 접속하므로, 호스트에서 직접 도달 가능한
// 환경(로컬/Docker Compose)에서만 쓴다. EKS(CloudNativePG)처럼 클러스터 밖에서 TCP로 못 붙고
// kubectl exec로만 접근 가능한 환경은 db/generate-legal-dong-codes-sql.mjs를 대신 쓴다
// (scripts/apply-environment-checkpoint-schema.sh vs -eks.sh와 같은 구도).
//
// 실행: node db/ingest-legal-dong-codes.mjs ["/path/to/법정동코드 전체자료.txt"]
// 인자를 생략하면 기본 경로("/home/kevin/법정동코드 전체자료.txt")를 사용한다.
// 여러 번 실행해도 안전하다(코드 PK 기준 UPSERT).
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { loadEnvFile } from './lib/load-env.mjs';

loadEnvFile(new URL('../.env', import.meta.url));

const filePath = process.argv[2] ?? '/home/kevin/법정동코드 전체자료.txt';
const BATCH_SIZE = 500;

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

    rows.push({
      code,
      sido,
      sigungu,
      dong,
      fullName,
      isActive: status === '존재'
    });
  }
  return rows;
}

const rows = parseRows(filePath);
console.log(`${filePath} 파싱 완료: ${rows.length}건 (활성 ${rows.filter((r) => r.isActive).length}건 / 폐지 ${rows.filter((r) => !r.isActive).length}건)`);

const client = new Client({
  host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE
});
await client.connect();

try {
  await client.query('BEGIN');

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = [];
    const placeholders = batch.map((row, idx) => {
      const base = idx * 6;
      values.push(row.code, row.sido, row.sigungu, row.dong, row.fullName, row.isActive);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });

    await client.query(
      `INSERT INTO course.legal_dong_codes (code, sido, sigungu, dong, full_name, is_active)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (code) DO UPDATE SET
         sido = EXCLUDED.sido, sigungu = EXCLUDED.sigungu, dong = EXCLUDED.dong,
         full_name = EXCLUDED.full_name, is_active = EXCLUDED.is_active`,
      values
    );
    inserted += batch.length;
    console.log(`${inserted}/${rows.length}건 적재`);
  }

  await client.query('COMMIT');
  console.log('완료');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('실패, 롤백함:', err);
  process.exit(1);
} finally {
  await client.end();
}
