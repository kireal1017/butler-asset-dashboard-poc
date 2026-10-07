import { describe, it, expect } from 'vitest';
import { formatArea, formatAreaRange, formatAreas, formatFloor, formatYmd } from './format.js';

describe('format', () => {
  it.each([[849500, '84.95㎡'], [495000, '49.5㎡'], [590000, '59㎡'], [849746, '84.9746㎡']])('area %i', (u, s) => expect(formatArea(u)).toBe(s));
  it('dates and floors', () => {
    expect(formatYmd('20160721')).toBe('2016.07.21');
    expect(formatFloor(10)).toBe('10층');
    expect(formatFloor(-1)).toBe('지하 1층');
  });
  it('area lists and ranges for comparison sections', () => {
    expect(formatAreas([849100, 849500, 849600])).toBe('84.91·84.95·84.96㎡');
    expect(formatAreas([594600])).toBe('59.46㎡');
    expect(formatAreaRange(799100, 899100)).toBe('79.91~89.91㎡');
    expect(formatAreaRange(1119862, 1219862)).toBe('111.99~121.99㎡');
    expect(formatAreaRange(544600, 644600)).toBe('54.46~64.46㎡');
  });
});
