// db/ 아래 일회성 Node 스크립트들이 프로젝트 루트 .env를 읽기 위한 공용 로더.
// Next.js는 자체적으로 .env를 로드하지만, 이 스크립트들은 Next.js 밖에서 직접 실행되므로 필요하다.
import { readFileSync } from 'node:fs';

export function loadEnvFile(url) {
  const text = readFileSync(url, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
