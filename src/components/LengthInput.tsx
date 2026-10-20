import { useEffect, useState } from 'react';
import type { Unit } from '../model/types';
import { parseLength, parseSmall, toInputValue, toSmallInputValue, formatLength, formatSmall } from '../model/units';

interface Props {
  label: string;
  valueMm: number;
  unit: Unit;
  onChange: (mm: number) => void;
  /** 'small' = wall thickness style: bare numbers are inches / cm */
  size?: 'normal' | 'small';
  min?: number;
  max?: number;
  id?: string;
}

/**
 * Text input for lengths. Accepts things like 12'6", 12.5, 3.8 m, 380 cm.
 * The value is applied when the user leaves the field or presses Enter.
 */
export function LengthInput({ label, valueMm, unit, onChange, size = 'normal', min = 0, max = 100000, id }: Props) {
  const toText = (mm: number) => (size === 'small' ? toSmallInputValue(mm, unit) : toInputValue(mm, unit));
  const [text, setText] = useState(() => toText(valueMm));
  const [error, setError] = useState<string | null>(null);
  const inputId = id ?? `len-${label.replace(/\s+/g, '-').toLowerCase()}`;

  // Update the text when the value or unit changes from outside.
  useEffect(() => {
    setText(toText(valueMm));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMm, unit, size]);

  const fmt = (mm: number) => (size === 'small' ? formatSmall(mm, unit) : formatLength(mm, unit));

  const commit = () => {
    const mm = size === 'small' ? parseSmall(text, unit) : parseLength(text, unit);
    if (mm === null) {
      setError(unit === 'ft' ? `Try like 12'6" or 12.5` : 'Try like 3.5 or 350 cm');
      return;
    }
    if (mm < min || mm > max) {
      setError(`Must be between ${fmt(min)} and ${fmt(max)}`);
      return;
    }
    setError(null);
    if (mm !== valueMm) onChange(mm);
    else setText(toText(valueMm));
  };

  const unitHint = size === 'small' ? (unit === 'ft' ? 'in' : 'cm') : unit === 'ft' ? 'ft' : 'm';

  return (
    <div className="field">
      <label htmlFor={inputId}>
        {label} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>({unitHint})</span>
      </label>
      <input
        id={inputId}
        className={`input${error ? ' invalid' : ''}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
