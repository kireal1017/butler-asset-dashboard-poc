import { describe, it, expect } from 'vitest';
import {
  formatWon, formatWonRaw, formatWonCompact, formatRate, formatChange, changeDirection, describeChange,
} from './format.js';

describe('formatWon (spec 3장 금액 표기)', () => {
  it.each([
    [620_000_000, '6억 2,000만원'],
    [100_000_000, '1억원'],
    [12_300_000_000, '123억원'],
    [350_000_000, '3억 5,000만원'],
    [50_000_000, '5,000만원'],
    [800_000, '80만원'],
    [805_000, '80만 5,000원'],
    [9_000, '9,000원'],
    [0, '0원'],
    [-15_000_000, '−1,500만원'],
  ])('%i → %s', (v, s) => expect(formatWon(v)).toBe(s));

  it('returns empty text for missing values', () => {
    expect(formatWon(null)).toBe('');
    expect(formatWon(undefined)).toBe('');
  });

  it('rounds non-integers to whole won', () => expect(formatWon(800_000.4)).toBe('80만원'));
});

describe('formatWonRaw (계약 카드 보증금)', () => {
  it.each([
    [50_000_000, '50,000,000원'],
    [0, '0원'],
    [1_234, '1,234원'],
    [-1_000, '−1,000원'],
  ])('%i → %s', (v, s) => expect(formatWonRaw(v)).toBe(s));
});

describe('formatWonCompact (등락 금액)', () => {
  it.each([
    [210_000_000, '2억 1,000만'],
    [-15_000_000, '1,500만'],
    [100_000_000, '1억'],
    [5_000, '5,000원'],
    [0, '0원'],
  ])('%i → %s', (v, s) => expect(formatWonCompact(v)).toBe(s));
});

describe('formatRate', () => {
  it.each([
    [51.23, '+51.2%'],
    [-2.05, '−2.1%'],
    [2.45, '+2.5%'],
    [-2.45, '−2.5%'],
    [0.04, '0.0%'],
    [0, '0.0%'],
  ])('%f → %s', (v, s) => expect(formatRate(v)).toBe(s));
});

describe('formatChange (등락 표시 (c): 부호·화살표 중심)', () => {
  it('formats increases with ▲ and +', () => {
    expect(formatChange(210_000_000, 51.2)).toBe('▲ 2억 1,000만 (+51.2%)');
  });
  it('formats decreases with ▼ and U+2212', () => {
    expect(formatChange(-15_000_000, -2.1)).toBe('▼ 1,500만 (−2.1%)');
  });
  it('formats no change in words', () => {
    expect(formatChange(0, 0)).toBe('변동 없음 (0.0%)');
  });
  it('omits the rate when missing', () => {
    expect(formatChange(30_000_000)).toBe('▲ 3,000만');
    expect(formatChange(30_000_000, null)).toBe('▲ 3,000만');
  });
  it('classifies direction', () => {
    expect(changeDirection(1)).toBe('up');
    expect(changeDirection(-1)).toBe('down');
    expect(changeDirection(0)).toBe('flat');
    expect(changeDirection(null)).toBe('flat');
  });
  it('describes the change for screen readers without relying on arrows', () => {
    expect(describeChange(210_000_000, 51.2)).toBe('상승 2억 1,000만원, 51.2퍼센트');
    expect(describeChange(-15_000_000, -2.1)).toBe('하락 1,500만원, 2.1퍼센트');
  });
});
