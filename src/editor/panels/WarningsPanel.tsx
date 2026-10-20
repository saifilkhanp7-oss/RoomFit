import { AlertTriangle, CheckCircle2, OctagonAlert } from 'lucide-react';
import type { Warning } from '../../geometry/warnings';
import './panels.css';

export function WarningsPanel({ warnings, onPick }: { warnings: Warning[]; onPick: (w: Warning) => void }) {
  if (warnings.length === 0) {
    return (
      <div className="warn-empty">
        <CheckCircle2 size={18} /> No problems found
      </div>
    );
  }
  return (
    <ul className="warn-list">
      {warnings.map((w) => (
        <li key={w.id}>
          <button className={`warn-item ${w.level}`} onClick={() => onPick(w)}>
            {w.level === 'red' ? <OctagonAlert size={17} /> : <AlertTriangle size={17} />}
            <span>{w.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
