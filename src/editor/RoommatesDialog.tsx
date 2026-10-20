import { useState } from 'react';
import { Plus, Share2, SquareDashedMousePointer, Trash2, UserRound } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import type { Floor, Home, Person } from '../model/types';
import { PERSON_COLORS } from '../model/ops';
import { id as newId } from '../model/defaults';
import './estimate.css';

interface Props {
  home: Home;
  floor: Floor;
  onPeople: (people: Person[], meId?: string | null) => void;
  onDrawSpace: (personId: string) => void;
  onShare: () => void;
  onClose: () => void;
}

/** People sharing the room: each gets a colour, their own space, and their own things. */
export function RoommatesDialog({ home, floor, onPeople, onDrawSpace, onShare, onClose }: Props) {
  const people = home.people ?? [];
  const [name, setName] = useState('');
  const add = () => {
    const n = name.trim().slice(0, 30);
    if (!n) return;
    const used = new Set(people.map((p) => p.color));
    const color = PERSON_COLORS.find((c) => !used.has(c)) ?? PERSON_COLORS[people.length % PERSON_COLORS.length];
    onPeople([...people, { id: newId(), name: n, color }], people.length === 0 ? undefined : undefined);
    setName('');
  };
  const things = (pid: string) => floor.items.filter((it) => it.owner === pid).length;
  const hasSpace = (pid: string) => (floor.zones ?? []).some((z) => z.personId === pid);

  return (
    <Dialog title="Roommates" subtitle="Sharing a room? Give everyone a colour, their own space and their own things." onClose={onClose}>
      <div className="est">
        <ul className="est-rooms">
          {people.map((p) => (
            <li key={p.id} className="est-room">
              <div className="est-room-head">
                <strong className="person-name">
                  <span className="person-dot big" style={{ background: p.color }} /> {p.name}
                  {home.meId === p.id && <span className="me-tag">me</span>}
                </strong>
                <span className="muted">
                  {things(p.id)} thing{things(p.id) === 1 ? '' : 's'} on this floor
                </span>
              </div>
              <div className="preset-row" style={{ margin: 0 }}>
                {PERSON_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch-sm${p.color === c ? ' on' : ''}`}
                    style={{ background: c }}
                    aria-label={`Colour ${c} for ${p.name}`}
                    aria-pressed={p.color === c}
                    onClick={() => onPeople(people.map((x) => (x.id === p.id ? { ...x, color: c } : x)))}
                  />
                ))}
              </div>
              <div className="thing-actions" style={{ flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => onDrawSpace(p.id)}>
                  <SquareDashedMousePointer size={16} /> {hasSpace(p.id) ? 'Draw another space' : `Draw ${p.name}'s space`}
                </button>
                <button className={`btn${home.meId === p.id ? ' btn-primary' : ''}`} aria-pressed={home.meId === p.id} onClick={() => onPeople(people, home.meId === p.id ? null : p.id)}>
                  <UserRound size={16} /> This is me
                </button>
                <button
                  className="icon-btn danger"
                  aria-label={`Remove ${p.name}`}
                  onClick={() =>
                    onPeople(
                      people.filter((x) => x.id !== p.id),
                      home.meId === p.id ? null : undefined,
                    )
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <form
          className="add-person"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input id="person-name" className="input" placeholder="Name, e.g. Rahul" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
            <Plus size={17} /> Add
          </button>
        </form>
        <p className="hint">
          Select any furniture → <strong>Belongs to</strong> to mark whose it is. With "This is me", new things you add are yours. You get a warning if someone's things are in another person's space.
        </p>

        {people.length > 0 && (
          <div className="est-result">
            <h4 className="est-h" style={{ marginTop: 0 }}>
              Let a roommate add their things
            </h4>
            <ol className="steps-list">
              <li>Send them this home's link (whole home).</li>
              <li>They save a copy, open Roommates, tap "This is me" on their name and add their things.</li>
              <li>They send their link back. Open it and tap "Bring in their things".</li>
            </ol>
            <button className="btn btn-block" onClick={onShare}>
              <Share2 size={17} /> Send the link
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
