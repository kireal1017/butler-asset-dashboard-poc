// AC-D5 비밀 스캔: .env의 인증키(원본·URL 인코딩)가 저장소 파일, git 이력, DB 원본 응답, 서버 로그에 없는지 검사한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const key = env.DATA_GO_KR_SERVICE_KEY;
if (!key) { console.error('no key in .env'); process.exit(2); }
const needles = [...new Set([key, encodeURIComponent(key)])];
const hits = [];
const check = (where, text) => { if (needles.some((n) => text.includes(n))) hits.push(where); };
const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

// 1) 추적 + 미추적(.gitignore 제외) 파일
const files = git('ls-files -z --cached --others --exclude-standard').split('\0').filter(Boolean);
for (const f of files) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) check(`file ${f}`, fs.readFileSync(p, 'latin1') + fs.readFileSync(p, 'utf8'));
}
// 2) git 이력 전체
check('git history', git('log -p --all'));
// 3) DB 원본 응답
const dbPath = env.DB_PATH || path.join(os.homedir(), '.butler-poc', 'app.db');
if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath, { readonly: true });
  for (const r of db.prepare('SELECT sgg_cd, deal_ym, page, body FROM raw_responses').iterate()) check(`raw_responses ${r.sgg_cd}/${r.deal_ym}/${r.page}`, r.body);
}
// 4) 서버 로그
const tmp = process.env.TEMP || os.tmpdir();
for (const f of fs.readdirSync(tmp).filter((n) => n.startsWith('butler-') && n.endsWith('.log'))) check(`log ${f}`, fs.readFileSync(path.join(tmp, f), 'utf8'));

console.log(`scan-secrets: ${files.length} files, git history, raw_responses, logs → ${hits.length} hits`);
if (hits.length) console.log(hits.join('\n'));
process.exit(hits.length ? 1 : 0);
