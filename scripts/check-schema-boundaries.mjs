#!/usr/bin/env node
// services-msa 각 서비스가 자기 소유 스키마 밖에 새 쓰기를 만들지 못하게 막는 최소 정적 검사다.
// 진짜 SQL 파서가 아니라 정규식 기반이라 완벽하진 않지만(문자열 조합 SQL은 놓칠 수 있다),
// "FROM/JOIN/INSERT INTO/UPDATE <schema>.<table>" 형태로 스키마가 하드코딩된 대부분의 쿼리는
// 잡아낸다. CLAUDE.md §4 표 + db/041_service_db_roles.sql의 GRANT 목록과 반드시 같이 갱신한다.
//
// 실행: node scripts/check-schema-boundaries.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SERVICES_DIR = 'services-msa';

// 서비스별: own(전체 DML 허용) / readOnly(SELECT만 허용, db/041의 GRANT와 반드시 일치시킨다)
const ACCESS_MAP = {
  'auth-service': { own: ['auth_user'], readOnly: [] },
  'course-service': { own: ['course'], readOnly: ['auth_user', 'running_record'] },
  'course-recommendation-service': { own: ['course_recommendation'], readOnly: ['auth_user', 'course'] },
  'running-record-service': { own: ['running_record'], readOnly: ['auth_user', 'course', 'shoe'] },
  'crew-service': { own: ['crew', 'crew_chat'], readOnly: ['auth_user', 'running_record'] },
  'coaching-service': { own: ['coaching', 'environment'], readOnly: [] },
  'ai-assistant-service': { own: ['ai_assistant'], readOnly: [] },
  'challenge-service': { own: ['challenge'], readOnly: ['auth_user', 'crew'] },
  'shoe-service': { own: ['shoe'], readOnly: [] },
  'marathon-service': { own: ['marathon'], readOnly: ['auth_user'] },
  'media-service': { own: ['media'], readOnly: [] },
  'notification-service': { own: ['notification', 'support'], readOnly: ['auth_user', 'crew'] }
};

// public(PostGIS 확장 스키마)은 어느 서비스나 참조 가능 — 스키마 소유권 대상이 아니다.
const EXEMPT_SCHEMAS = new Set(['public']);

const WRITE_KEYWORDS = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi;
const READ_KEYWORDS = /\b(FROM|JOIN)\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi;

function listTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

function checkFile(filePath, allowedSchemas, ownSchemas) {
  const content = readFileSync(filePath, 'utf8');
  const violations = [];

  for (const m of content.matchAll(WRITE_KEYWORDS)) {
    const schema = m[2].toLowerCase();
    if (EXEMPT_SCHEMAS.has(schema)) continue;
    if (!ownSchemas.includes(schema)) {
      violations.push(`쓰기(${m[1].trim()}) 대상이 자기 소유 스키마가 아님: ${schema}.${m[3]}`);
    }
  }

  for (const m of content.matchAll(READ_KEYWORDS)) {
    const schema = m[2].toLowerCase();
    if (EXEMPT_SCHEMAS.has(schema)) continue;
    if (!allowedSchemas.includes(schema)) {
      violations.push(`허용되지 않은 스키마 조회: ${schema}.${m[3]} (FROM/JOIN)`);
    }
  }

  return violations;
}

let hasViolation = false;

for (const [service, { own, readOnly }] of Object.entries(ACCESS_MAP)) {
  const srcDir = join(SERVICES_DIR, service, 'src');
  let files;
  try {
    files = listTsFiles(srcDir);
  } catch {
    continue; // 서비스 디렉터리가 없으면 건너뛴다(리네임/삭제 등)
  }

  const allowedSchemas = [...own, ...readOnly];
  for (const file of files) {
    const violations = checkFile(file, allowedSchemas, own);
    for (const v of violations) {
      hasViolation = true;
      console.error(`[schema-boundary] ${file}: ${v}`);
    }
  }
}

if (hasViolation) {
  console.error('\n서비스 경계를 벗어난 스키마 접근이 발견됐습니다. db/041_service_db_roles.sql의 GRANT 목록과 이 스크립트의 ACCESS_MAP을 함께 확인하세요.');
  process.exit(1);
} else {
  console.log('[schema-boundary] 모든 서비스가 선언된 스키마 경계 안에서만 접근합니다.');
}
