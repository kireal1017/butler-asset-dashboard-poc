// verify/ 의 스크립트가 앱 코드(server/, client/)를 import하지 않는지 검사한다 (독립 재계산 보장).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]*(?:server|client)\/[^'"]*)['"]/g;
const hits = [];
for (const f of fs.readdirSync(DIR).filter((n) => /\.(m?js)$/.test(n))) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  for (const m of src.matchAll(FORBIDDEN)) hits.push(`${f}: ${m[1]}`);
}
console.log(hits.length ? hits.join('\n') : 'check-imports: 0 forbidden imports');
process.exit(hits.length ? 1 : 0);
