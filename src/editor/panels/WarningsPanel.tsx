import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, OctagonAlert, Wand2 } from 'lucide-react';
import type { Warning } from '../../geometry/warnings';
import './panels.css';

interface Props {
  warnings: Warning[];
  ignored?: Warning[];
  onPick: (w: Warning) => void;
  onFix?: (w: Warning) => void;
  onLetItBe?: (w: Warning, ok: boolean) => void;
}

/**
 * The list of warnings. Each one can be tapped to see it on the plan, fixed in one tap when
 * there's an easy fix, or accepted with "Let it be" (e.g. a chair pushed under a table).
 */
export function WarningsPanel({ warnings, ignored = [], onPick, onFix, onLetItBe }: Props) {
  const [showIgnored, setShowIgnored] = useState(false);
  return (
    <div className="warn-wrap">
      {warnings.length === 0 ? (
        <div className="warn-empty">
          <CheckCircle2 size={18} /> No problems found
        </div>
      ) : (
        <ul className="warn-list">
          {warnings.map((w) => (
            <li key={w.id} className={`warn-card ${w.level}`}>
              <button className="warn-item" onClick={() => onPick(w)}>
                {w.level === 'red' ? <OctagonAlert size={17} /> : <AlertTriangle size={17} />}
                <span>{w.message}</span>
              </button>
              {(w.fix || onLetItBe) && (
                <div className="warn-actions">
                  {w.fix && onFix && (
                    <button className="warn-btn fix" onClick={() => onFix(w)}>
                      <Wand2 size={14} /> {w.fix.label}
                    </button>
                  )}
                  {onLetItBe && (
                    <button className="warn-btn" onClick={() => onLetItBe(w, true)}>
                      Let it be
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {ignored.length > 0 && (
        <div className="ignored">
          <button className="ignored-toggle" aria-expanded={showIgnored} onClick={() => setShowIgnored(!showIgnored)}>
            {showIgnored ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Let be ({ignored.length})
          </button>
          {showIgnored && (
            <ul className="warn-list">
              {ignored.map((w) => (
                <li key={w.id} className="warn-card ignored-card">
                  <button className="warn-item muted" onClick={() => onPick(w)}>
                    <CheckCircle2 size={16} />
                    <span>{w.message}</span>
                  </button>
                  {onLetItBe && (
                    <div className="warn-actions">
                      <button className="warn-btn" onClick={() => onLetItBe(w, false)}>
                        Show warning again
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
