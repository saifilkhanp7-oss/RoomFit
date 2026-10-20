import { describe, it, expect } from 'vitest';
import { formatLength, parseLength, parseSmall, formatSmall, toInputValue } from './units';

describe('parseLength (feet mode)', () => {
  const cases: [string, number][] = [
    ['12', 3658],
    ['12.5', 3810],
    ["12'6", 3810],
    ["12' 6\"", 3810],
    ['12 ft 6 in', 3810],
    ['12ft6in', 3810],
    ['12′ 6″', 3810],
    ['150in', 3810],
    ['150"', 3810],
    ['3.81 m', 3810],
    ['381cm', 3810],
    ["10'", 3048],
  ];
  for (const [input, mm] of cases) {
    it(`parses ${input}`, () => expect(parseLength(input, 'ft')).toBe(mm));
  }
  it('rejects junk', () => {
    expect(parseLength('abc', 'ft')).toBeNull();
    expect(parseLength('', 'ft')).toBeNull();
    expect(parseLength('-3', 'ft')).toBeNull();
  });
});

describe('parseLength (meter mode)', () => {
  it('bare number is metres', () => expect(parseLength('3.81', 'm')).toBe(3810));
  it('cm', () => expect(parseLength('381 cm', 'm')).toBe(3810));
  it('comma decimal', () => expect(parseLength('3,5', 'm')).toBe(3500));
  it('still accepts feet', () => expect(parseLength("12'", 'm')).toBe(3658));
});

describe('formatLength', () => {
  it('feet and inches', () => expect(formatLength(3810, 'ft')).toBe('12′ 6″'));
  it('whole feet', () => expect(formatLength(3048, 'ft')).toBe('10′'));
  it('inches only', () => expect(formatLength(229, 'ft')).toBe('9″'));
  it('metres', () => expect(formatLength(3810, 'm')).toBe('3.81 m'));
  it('round trip via input value', () => {
    for (const mm of [3810, 3048, 1000, 2286, 610]) {
      expect(Math.abs(parseLength(toInputValue(mm, 'ft'), 'ft')! - mm)).toBeLessThanOrEqual(13);
      expect(parseLength(toInputValue(mm, 'm'), 'm')).toBe(mm);
    }
  });
});

describe('small lengths', () => {
  it('bare number = inches in ft mode', () => expect(parseSmall('9', 'ft')).toBe(229));
  it('bare number = cm in m mode', () => expect(parseSmall('23', 'm')).toBe(230));
  it('formats', () => {
    expect(formatSmall(229, 'ft')).toBe('9″');
    expect(formatSmall(230, 'm')).toBe('23 cm');
  });
});
