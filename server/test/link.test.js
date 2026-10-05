import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { decideLink, decideOwner, floorFromHo, normalizeName, parseLot } from '../src/logic/link.js';

const basis = (code) => JSON.parse(fs.readFileSync(new URL(`./fixtures/aptbasis-${code}.json`, import.meta.url), 'utf8'));
const HAGYE = '하계동';

describe('parseLot (P1: K-APT 주소에서 지번)', () => {
  it('parses real kaptAddr values', () => {
    expect(parseLot(basis('A13987306').kaptAddr, HAGYE)).toEqual({ bonbun: 271, bubun: 3 });
    expect(parseLot(basis('A13987303').kaptAddr, HAGYE)).toEqual({ bonbun: 270, bubun: 0 });
    expect(parseLot(basis('A13993501').kaptAddr, HAGYE)).toEqual({ bonbun: 255, bubun: 1 });
  });
  it('returns null when the 법정동 is not in the address', () => {
    expect(parseLot('서울특별시 노원구 중계동 1', HAGYE)).toBeNull();
  });
});

describe('normalizeName', () => {
  it.each([
    ['하계청구', '청구'],
    ['청구', '청구'],
    ['하계한신', '한신'],
    ['한신1', '한신'],
    ['장미(시영6)', '장미'],
    ['하계 6단지 장미아파트', '6단지장미'],
    ['하계2차현대아파트', '2차현대'],
    ['현대', '현대'],
    ['하계', '하계'],
  ])('%s → %s', (a, b) => expect(normalizeName(a, HAGYE)).toBe(b));
});

const cx = (name) => ({ kaptCode: 'K', name, umdName: HAGYE });

describe('decideLink (PRD 7.1)', () => {
  it('uses every aptSeq on the lot when one K-APT complex owns it (270 → 현대 + 우성)', () => {
    const r = decideLink({ complex: cx('하계현대우성'), lotSeqs: [{ aptSeq: '11350-85', aptNm: '현대' }, { aptSeq: '11350-75', aptNm: '우성' }], siblings: [] });
    expect(r).toMatchObject({ aptSeqs: ['11350-85', '11350-75'], method: 'lot' });
  });

  const lot284 = [{ aptSeq: '11350-76', aptNm: '청구' }, { aptSeq: '11350-81', aptNm: '한신1' }];
  it('splits a shared lot by unique bidirectional name match (284)', () => {
    expect(decideLink({ complex: cx('하계청구'), lotSeqs: lot284, siblings: [{ name: '하계한신' }] }).aptSeqs).toEqual(['11350-76']);
    expect(decideLink({ complex: cx('하계한신'), lotSeqs: lot284, siblings: [{ name: '하계청구' }] }).aptSeqs).toEqual(['11350-81']);
  });

  it('blocks when both K-APT names normalize the same', () => {
    const r = decideLink({ complex: cx('하계청구'), lotSeqs: lot284, siblings: [{ name: '청구' }] });
    expect(r).toMatchObject({ aptSeqs: [], error: 'AMBIGUOUS_SHARED_LOT' });
  });

  it('blocks when two trade complexes on the shared lot match the same name', () => {
    const r = decideLink({ complex: cx('하계청구'), lotSeqs: [...lot284, { aptSeq: '11350-99', aptNm: '청구(2)' }], siblings: [{ name: '하계한신' }] });
    expect(r.error).toBe('AMBIGUOUS_SHARED_LOT');
  });

  const umdSeqs = [
    { aptSeq: '11350-85', aptNm: '현대', areas: [849500, 716800] },
    { aptSeq: '11350-79', aptNm: '하계2현대', areas: [849800] },
  ];
  const umdComplexes = [{ name: '하계2차현대아파트' }, { name: '하계현대우성' }];

  it('3b never links 현대(270) to 하계2차현대(288) by loose name similarity', () => {
    const r = decideLink({ complex: cx('하계2차현대아파트'), lotSeqs: [], siblings: [], umdSeqs, umdComplexes, assetAreaU: 849500 });
    expect(r.aptSeqs).toEqual([]);
    expect(r.error).toBe('NOT_FOUND');
  });

  it('3b links an exact unique name with an area cross-check and records an override', () => {
    const r = decideLink({ complex: cx('현대'), lotSeqs: [], siblings: [], umdSeqs, umdComplexes: [{ name: '현대' }], assetAreaU: 849500 });
    expect(r).toMatchObject({ aptSeqs: ['11350-85'], method: 'name', newOverride: '11350-85' });
  });

  it('3b refuses when no trade of the candidate is within 0.1㎡ of the asset', () => {
    const r = decideLink({ complex: cx('현대'), lotSeqs: [], siblings: [], umdSeqs, umdComplexes: [{ name: '현대' }], assetAreaU: 600000 });
    expect(r.aptSeqs).toEqual([]);
  });

  it('keeps an override alongside later lot links (union)', () => {
    const r = decideLink({ complex: cx('하계현대우성'), lotSeqs: [{ aptSeq: '11350-85', aptNm: '현대' }], siblings: [], overrides: ['11350-75'] });
    expect(r.aptSeqs.sort()).toEqual(['11350-75', '11350-85']);
  });
});

describe('decideOwner (동이 속한 실거래 단지)', () => {
  it('picks the aptSeq whose trades carry the dong', () => {
    expect(decideOwner(['11350-85', '11350-75'], [{ aptSeq: '11350-75', count: 4 }])).toEqual({ owner: '11350-75', known: true, basis: 'dong' });
  });
  it('is unknown on ties or no evidence', () => {
    expect(decideOwner(['a', 'b'], [{ aptSeq: 'a', count: 2 }, { aptSeq: 'b', count: 2 }]).known).toBe(false);
    expect(decideOwner(['a', 'b'], []).known).toBe(false);
  });
  it('is trivially known for a single aptSeq', () => {
    expect(decideOwner(['a'], [])).toMatchObject({ owner: 'a', known: true });
  });
  it('falls back to the only aptSeq with the exact register area (우성 84.91 vs 현대 84.95)', () => {
    expect(decideOwner(['11350-85', '11350-75'], [], ['11350-75'])).toEqual({ owner: '11350-75', known: true, basis: 'area' });
    expect(decideOwner(['a', 'b'], [], ['a', 'b']).known).toBe(false);
  });
  it('prefers dong evidence over area evidence', () => {
    expect(decideOwner(['a', 'b'], [{ aptSeq: 'b', count: 1 }], ['a']).owner).toBe('b');
  });
});

describe('floorFromHo', () => {
  it.each([['1203', 12], ['501', 5], ['1203호', 12], ['12', null]])('%s → %s', (h, f) => expect(floorFromHo(h)).toBe(f));
});
