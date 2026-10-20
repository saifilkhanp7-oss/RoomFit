import type { Unit } from './types';

export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;

/** Format a length in mm for display, e.g. 12′ 6″ or 3.81 m */
export function formatLength(mm: number, unit: Unit): string {
  if (unit === 'm') {
    const m = mm / 1000;
    return `${trimNum(m, 2)} m`;
  }
  const totalIn = Math.round(mm / MM_PER_INCH);
  const sign = totalIn < 0 ? '-' : '';
  const abs = Math.abs(totalIn);
  const ft = Math.floor(abs / 12);
  const inch = abs % 12;
  if (ft === 0) return `${sign}${inch}″`;
  if (inch === 0) return `${sign}${ft}′`;
  return `${sign}${ft}′ ${inch}″`;
}

/** Short format for small lengths like wall thickness: 9″ or 23 cm */
export function formatSmall(mm: number, unit: Unit): string {
  if (unit === 'm') return `${trimNum(mm / 10, 1)} cm`;
  return `${trimNum(mm / MM_PER_INCH, 1)}″`;
}

/** Value to prefill an input with (no unit symbols except ft'in) */
export function toInputValue(mm: number, unit: Unit): string {
  if (unit === 'm') return trimNum(mm / 1000, 3);
  const totalIn = Math.round((mm / MM_PER_INCH) * 2) / 2; // nearest half inch
  const ft = Math.floor(totalIn / 12);
  const inch = trimNum(totalIn - ft * 12, 1);
  if (inch === '0') return `${ft}'`;
  if (ft === 0) return `${inch}"`;
  return `${ft}'${inch}"`;
}

export function toSmallInputValue(mm: number, unit: Unit): string {
  if (unit === 'm') return trimNum(mm / 10, 1);
  return trimNum(mm / MM_PER_INCH, 1);
}

function trimNum(n: number, digits: number): string {
  const s = n.toFixed(digits);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Parse a length typed by the user. Returns mm (rounded) or null if invalid.
 * Feet mode accepts: 12  12.5  12'6  12' 6"  12ft 6in  12 ft  150in  150"  3.5m  350cm
 * Meter mode accepts: 3.81  3.81m  381cm  3810mm  and also feet/inch forms if marked.
 * A bare number means feet (ft mode) or metres (m mode).
 */
export function parseLength(input: string, unit: Unit): number | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[′’‘`]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ');
  if (!s) return null;

  const num = '(\\d+(?:\\.\\d+)?|\\.\\d+)';

  // metric with explicit unit
  let m = s.match(new RegExp(`^${num} ?(mm|cm|m|meter|meters|metre|metres)$`));
  if (m) {
    const v = parseFloat(m[1]);
    const f = m[2] === 'mm' ? 1 : m[2] === 'cm' ? 10 : 1000;
    return finish(v * f);
  }

  // feet + inches: 12'6, 12' 6", 12ft 6in, 12 ft 6 inches, 12'
  m = s.match(new RegExp(`^${num} ?(?:'|ft|feet|foot)(?: ?${num} ?(?:"|in|inch|inches)?)?$`));
  if (m) {
    const ft = parseFloat(m[1]);
    const inch = m[2] ? parseFloat(m[2]) : 0;
    return finish(ft * MM_PER_FOOT + inch * MM_PER_INCH);
  }

  // inches only
  m = s.match(new RegExp(`^${num} ?(?:"|in|inch|inches)$`));
  if (m) return finish(parseFloat(m[1]) * MM_PER_INCH);

  // bare number
  m = s.match(new RegExp(`^${num}$`));
  if (m) {
    const v = parseFloat(m[1]);
    return finish(unit === 'm' ? v * 1000 : v * MM_PER_FOOT);
  }
  return null;
}

/** Parse small lengths (wall thickness): bare number = inches (ft mode) or cm (m mode). */
export function parseSmall(input: string, unit: Unit): number | null {
  const s = input.trim().toLowerCase();
  if (/^\d+(\.\d+)?$|^\.\d+$/.test(s)) {
    const v = parseFloat(s);
    return finish(unit === 'm' ? v * 10 : v * MM_PER_INCH);
  }
  return parseLength(input, unit);
}

function finish(mm: number): number | null {
  if (!isFinite(mm) || mm < 0) return null;
  return Math.round(mm);
}

/** Grid steps in mm for the unit: minor and major line spacing */
export function gridSteps(unit: Unit): { minor: number; major: number } {
  return unit === 'm' ? { minor: 500, major: 1000 } : { minor: MM_PER_FOOT, major: MM_PER_FOOT * 5 };
}
