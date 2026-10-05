import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { isResidential, lookupExclusiveUnit } from '../src/external/bldrgst.js';

const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/bldrgst-golden-unit.json', import.meta.url), 'utf8'));

// 실제 응답 행 (하계동 273 610동 1301): 같은 호에 1층 대피소 전유부와 13층 아파트 전유부가 함께 있다
const SHELTER = { exposPubuseGbCdNm: '전유', dongNm: '610동', hoNm: '1301', flrNo: 1, area: 3.64, mainPurpsCdNm: '아파트', etcPurps: '대피소', bldNm: ' ' };
const HOME = { ...SHELTER, flrNo: 13, area: 39.92, etcPurps: '아파트' };

const apiReturning = (rowsByVariant) => {
  const calls = [];
  return {
    calls,
    request: async (api, url, p) => {
      calls.push(`${p.dongNm}/${p.hoNm}`);
      const item = rowsByVariant[`${p.dongNm}/${p.hoNm}`] ?? [];
      return JSON.stringify({ response: { body: { items: { item } } } });
    },
  };
};
const unit = { sigunguCd: '11350', bjdongCd: '10400', bonbun: 273, bubun: 0, dong: '610', ho: '1301' };

describe('건축물대장 전유부 조회', () => {
  it('residential test uses etcPurps first', () => {
    expect(isResidential(SHELTER)).toBe(false);
    expect(isResidential(HOME)).toBe(true);
    expect(isResidential({ mainPurpsCdNm: '공동주택', etcPurps: '' })).toBe(true);
    expect(golden.items.filter((r) => r.exposPubuseGbCdNm === '전유').every(isResidential)).toBe(true);
  });

  it('skips the shelter row and returns the apartment unit', async () => {
    const api = apiReturning({ '610동/1301': [SHELTER, HOME] });
    expect(await lookupExclusiveUnit(api, unit)).toMatchObject({ areaU: 399200, floor: 13, dongNm: '610동', hoNm: '1301' });
  });

  it('tries notation variants in order until one matches (삼익선경 needs 호)', async () => {
    const api = apiReturning({ '610동/1301호': [HOME] });
    const r = await lookupExclusiveUnit(api, unit);
    expect(api.calls).toEqual(['610동/1301', '610/1301', '610동/1301호']);
    expect(r.hoNm).toBe('1301호');
  });

  it('returns null when no residential exclusive row exists', async () => {
    const api = apiReturning({ '610동/1301': [SHELTER] });
    expect(await lookupExclusiveUnit(api, unit)).toBeNull();
  });

  it('applies the shared-lot filter', async () => {
    const api = apiReturning({ '610동/1301': [{ ...HOME, bldNm: '한신아파트' }] });
    expect(await lookupExclusiveUnit(api, unit, (r) => r.bldNm !== '한신아파트')).toBeNull();
  });
});
