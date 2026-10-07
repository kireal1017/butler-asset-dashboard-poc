// v3 테스트용 실제 응답 표본을 만든다(1회성). 인증키는 저장·출력하지 않는다.
//  - server/test/fixtures/rent-11350-hagye.json: 노원구 전월세 2026-07~09 중 하계현대우성(11350-75, 11350-85) 항목
//  - server/test/fixtures/bldtitle-hagye270.json: 하계동 270번지 표제부·총괄표제부 원본 JSON
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const KEY = env.DATA_GO_KR_SERVICE_KEY;
const OUT = path.join(ROOT, 'server', 'test', 'fixtures');
const get = async (url, params) => (await fetch(`${url}?${new URLSearchParams({ serviceKey: KEY, ...params })}`)).text();

const items = [];
for (const ym of ['202607', '202608', '202609']) {
  const xml = await get('https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent', { LAWD_CD: '11350', DEAL_YMD: ym, numOfRows: '1000', pageNo: '1' });
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
    const it = {};
    for (const [, k, v] of block.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) it[k] = v;
    if (it.aptSeq === '11350-75' || it.aptSeq === '11350-85') items.push(it);
  }
}
fs.writeFileSync(path.join(OUT, 'rent-11350-hagye.json'), JSON.stringify({ source: 'RTMSDataSvcAptRent 11350 202607-202609, 하계현대우성만', items }, null, 1));

const p = { sigunguCd: '11350', bjdongCd: '10400', platGbCd: '0', bun: '0270', ji: '0000', _type: 'json', numOfRows: '100', pageNo: '1' };
const title = JSON.parse(await get('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo', p));
const recap = JSON.parse(await get('https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo', p));
fs.writeFileSync(path.join(OUT, 'bldtitle-hagye270.json'), JSON.stringify({ title, recap }, null, 1));

const all = fs.readFileSync(path.join(OUT, 'rent-11350-hagye.json'), 'utf8') + fs.readFileSync(path.join(OUT, 'bldtitle-hagye270.json'), 'utf8');
if (KEY && all.includes(KEY)) throw new Error('key leaked into fixture');
console.log(`rent items ${items.length}, title rows ${[].concat(title.response.body.items.item).length}`);
