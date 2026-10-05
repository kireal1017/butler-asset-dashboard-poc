import { describe, it, expect } from 'vitest';
import { formatManwon, formatSignedManwon, formatSignedRate, formatYm } from './money.js';

describe('PRD 7.9 금액 표기', () => {
  it.each([
    [124000, '12억 4,000만'],
    [78500, '7억 8,500만'],
    [9500, '9,500만'],
    [120000, '12억'],
    [43000, '4억 3,000만'],
    [10000, '1억'],
    [1230000, '123억'],
    [1, '1만'],
  ])('%i → %s', (v, s) => expect(formatManwon(v)).toBe(s));

  it('signs increases and decreases with + and U+2212', () => {
    expect(formatSignedManwon(12000)).toBe('+1억 2,000만');
    expect(formatSignedManwon(-1500)).toBe('−1,500만');
    expect(formatSignedManwon(0)).toBe('0원');
  });

  it('formats rates to one decimal with sign', () => {
    expect(formatSignedRate(10.66)).toBe('+10.7%');
    expect(formatSignedRate(-3)).toBe('−3.0%');
    expect(formatSignedRate(0.04)).toBe('0.0%');
    expect(formatSignedRate(-2.45)).toBe('−2.5%');
    expect(formatSignedRate(2.45)).toBe('+2.5%');
  });

  it('formats months', () => expect(formatYm('202608')).toBe('2026.08'));
});
