import { ArrowLeft, Share, SquarePlus } from 'lucide-react';
import { navigate } from '../router';
import { ThemeToggle } from '../components/ThemeToggle';
import './HomeList.css';

export function Help() {
  return (
    <div className="home-page">
      <header className="home-header">
        <div className="brand">
          <button className="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : navigate('/'))}>
            <ArrowLeft size={22} />
          </button>
          <span>Help</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="home-main help">
        <section>
          <h2>Moving around the plan</h2>
          <ul>
            <li>
              <strong>One finger</strong> on empty space moves the plan. <strong>Two fingers</strong> pinch to zoom.
            </li>
            <li>On a laptop: drag to move, mouse wheel or trackpad pinch to zoom. Keys: + − 0.</li>
            <li>The ⛶ button fits the whole plan on the screen.</li>
          </ul>
        </section>
        <section>
          <h2>Furniture</h2>
          <ul>
            <li>Tap <strong>Add</strong> (phone) or use the left panel (laptop/iPad). Tap an item to place it, or drag it onto the plan.</li>
            <li>Drag furniture to move it. It snaps to walls and other furniture.</li>
            <li>Select it to see the buttons: rotate 90°, copy, edit, delete. Drag the small round handle to turn it freely.</li>
            <li>
              <strong>Custom item</strong> lets you add anything with your own size, like "my guitar" or "cycle".
            </li>
            <li>Laptop keys: R rotate, arrows nudge, Ctrl/Cmd+Z undo, Ctrl/Cmd+D copy, Delete removes.</li>
          </ul>
        </section>
        <section>
          <h2>Rooms, doors and windows</h2>
          <ul>
            <li>
              <strong>Rooms</strong> → Add room puts a new room next to another one, with the wall thickness you choose.
            </li>
            <li>Select a room to change its size. With more than one room you can drag the selected room.</li>
            <li>
              Tap <strong>Door</strong> or <strong>Window</strong>, then tap a wall. Drag it along the wall. Change hinge side and which way it opens in its settings.
            </li>
            <li>The light curve next to a door is where it swings. Keep it free.</li>
          </ul>
        </section>
        <section>
          <h2>Hall, bathroom, balcony and parking</h2>
          <ul>
            <li>
              <strong>Rooms → Add hall / lobby</strong>: enter the size of the whole home. Your rooms go inside it, and the space left over is the hall. Its parts are shown with sizes, like 6′ × 10′ + 6′ × 2′.
            </li>
            <li>
              <strong>Add room</strong> → choose Bathroom, Kitchen, Balcony, Parking or Store. Put it <strong>inside</strong> a room or the hall (e.g. a bathroom inside a bedroom), or <strong>next to</strong> a room.
            </li>
            <li>Balconies get a railing instead of a full wall. Parking gets a shutter door.</li>
            <li>
              <strong>Basement / parking:</strong> Rooms → Add a floor or basement. Add a car from Vehicles. You get a warning if there's no space to open the doors or the gate is too narrow.
            </li>
          </ul>
        </section>
        <section>
          <h2>Warnings</h2>
          <ul>
            <li>
              <span className="dot red" /> Red: furniture overlaps, is outside the room, inside a wall, on stairs, or blocks a door.
            </li>
            <li>
              <span className="dot yellow" /> Yellow: less than 2 ft to walk between two items, a tall item covers a window, or something is too close to the ceiling fan.
            </li>
            <li>Tap a warning in the list to jump to it.</li>
          </ul>
        </section>
        <section>
          <h2>Houses with more floors</h2>
          <ul>
            <li>Use the floor tabs at the top. Tap the current tab to rename or delete it, and + to add a floor.</li>
            <li>Add <strong>Stairs</strong> from the Structure section. The same space shows as a stair opening on the floor above.</li>
          </ul>
        </section>
        <section>
          <h2>3D view (single floor)</h2>
          <ul>
            <li>Set the ceiling height in the room settings and the height of furniture to check tall things. Typical heights are used if you don't.</li>
            <li>In 3D: one finger turns, pinch zooms, two fingers move. "Cut walls" lowers the walls so you can see inside.</li>
          </ul>
        </section>
        <section id="install">
          <h2>Install on your phone</h2>
          <p>
            <strong>iPhone / iPad (Safari):</strong> tap <Share size={16} style={{ verticalAlign: '-3px' }} /> <strong>Share</strong>, then{' '}
            <SquarePlus size={16} style={{ verticalAlign: '-3px' }} /> <strong>Add to Home Screen</strong>.
          </p>
          <p>
            <strong>Android (Chrome):</strong> tap <strong>Install app</strong> on the home page, or ⋮ menu → <strong>Install app</strong>.
          </p>
          <p>After installing, RoomFit works without internet.</p>
        </section>
        <section>
          <h2>Your account</h2>
          <ul>
            <li>Sign up with a name nobody else has and a password. You stay logged in on that device.</li>
            <li>
              Write down the <strong>recovery code</strong> you get. If you forget your password: Log in → "Forgot password?" → your name + the code. It works once; you then get a new code.
            </li>
            <li>Your plans are saved to your account, so they are on all your devices. Without internet, changes are kept on the device and sent later.</li>
            <li>The round button with your first letter (top right) shows the sync status, log out and delete account.</li>
          </ul>
        </section>
        <section>
          <h2>Keeping your plans safe</h2>
          <ul>
            <li>Plans are saved to your account and on this device.</li>
            <li>Settings → Download backup gives you one file with all your plans. Import it on any device.</li>
            <li>Share link sends a copy of a plan. The other person can save their own copy.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
