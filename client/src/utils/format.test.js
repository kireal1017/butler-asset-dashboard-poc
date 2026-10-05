import { describe, it, expect } from 'vitest';
import { formatArea, formatFloor, formatYmd } from './format.js';

describe('format', () => {
  it.each([[849500, '84.95㎡'], [495000, '49.5㎡'], [590000, '59㎡'], [849746, '84.9746㎡']])('area %i', (u, s) => expect(formatArea(u)).toBe(s));
  it('dates and floors', () => {
    expect(formatYmd('20160721')).toBe('2016.07.21');
    expect(formatFloor(10)).toBe('10층');
    expect(formatFloor(-1)).toBe('지하 1층');
  });
});
