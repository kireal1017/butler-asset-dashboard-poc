import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}

const fileEnv = readDotEnv();
const env = (name) => process.env[name] ?? fileEnv[name] ?? '';

const devFaultArg = process.argv.find((a) => a.startsWith('--dev-fault='));

export function loadConfig(overrides = {}) {
  const asOf = env('AS_OF') || null;
  const devFault = devFaultArg ? devFaultArg.split('=')[1] : null;
  if (devFault && !['quota', 'fetch'].includes(devFault)) throw new Error(`unknown --dev-fault=${devFault}`);
  if (devFault && asOf) throw new Error('--dev-fault cannot be combined with AS_OF');
  return {
    serviceKey: env('DATA_GO_KR_SERVICE_KEY'),
    dbPath: env('DB_PATH') || path.join(process.env.LOCALAPPDATA || os.homedir(), 'butler-poc', 'app.db'),
    asOf,
    port: Number(env('API_PORT') || 3001),
    devFault,
    ...overrides,
  };
}

export function maskKey(text, key) {
  if (!key) return String(text);
  return String(text).split(key).join('[KEY]').split(encodeURIComponent(key)).join('[KEY]');
}
