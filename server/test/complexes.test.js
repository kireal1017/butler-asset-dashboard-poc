import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/index.js';
import { loadSeoulComplexes, searchComplexes, countComplexes } from '../src/services/complexes.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/aptlist-seoul-hagye.json', import.meta.url), 'utf8'));

function fakeApi(items, totalCount = items.length) {
  return { request: async () => JSON.stringify({ response: { body: { items, totalCount } } }) };
}

describe('complex list', () => {
  it('loads every complex and searches by partial name ignoring spaces', async () => {
    const db = openDb(':memory:');
    await loadSeoulComplexes(db, fakeApi(fixture.items));
    expect(countComplexes(db)).toBe(fixture.items.length);
    const r = searchComplexes(db, '6단지 장미');
    expect(r.map((x) => x.name)).toContain('하계 6단지 장미아파트');
    expect(r[0]).toMatchObject({ gu: '노원구', umdName: '하계동' });
    const named = fixture.items.filter((x) => x.kaptName.includes('하계')).length;
    expect(searchComplexes(db, '하계').length).toBe(named);
  });

  it('refuses a partial list', async () => {
    const db = openDb(':memory:');
    await expect(loadSeoulComplexes(db, fakeApi(fixture.items, 3405))).rejects.toThrow('3405');
  });

  it('treats LIKE wildcards literally', async () => {
    const db = openDb(':memory:');
    await loadSeoulComplexes(db, fakeApi(fixture.items));
    expect(searchComplexes(db, '%')).toEqual([]);
  });
});
