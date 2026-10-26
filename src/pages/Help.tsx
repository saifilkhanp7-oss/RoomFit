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
          <h2>Stacking and things under beds</h2>
          <ul>
            <li>
              Every item has a <strong>height</strong> and a <strong>height from the floor</strong>. Put a suitcase on top of a cupboard: select it, then tap the{' '}
              <strong>stack</strong> button (or "On top of Cupboard" in its settings). It shows a small ↑ badge with its height from the floor.
            </li>
            <li>
              Beds and tables can be <strong>open underneath (on legs)</strong> or <strong>closed</strong>. Set the open space height, e.g. 1′ 2″ under a hostel cot. Boxes or suitcases that are low enough fit
              under it without a warning.
            </li>
            <li>If something is up in the air with nothing under it, you get a warning. Shelves and mirrors fixed to the wall are allowed to hang: tick "Fixed to the wall".</li>
            <li>
              Every warning has <strong>Let it be</strong>. Use it when you know it's fine, e.g. a chair pushed under the table. You can bring it back from "Let be" in the warnings list.
            </li>
          </ul>
        </section>
        <section>
          <h2>Wall colours</h2>
          <ul>
            <li>
              Select a room → <strong>Wall colour</strong>. Pick a colour for all walls, or tap Top / Right / Bottom / Left wall (as on the plan) to paint just that one. The rainbow square lets you pick any
              colour.
            </li>
            <li>The plan shows a coloured line inside painted walls, and the 3D view shows the colours. Inner walls have their own colour too.</li>
          </ul>
        </section>
        <section>
          <h2>Walls inside a room</h2>
          <ul>
            <li>
              Tap <strong>Wall</strong>, then drag where the wall goes (or tap its two ends). It snaps to walls and corners and stays straight.
            </li>
            <li>
              Select it to set its length, thickness and height: <strong>Full wall</strong>, <strong>Half wall</strong>, or <strong>From the ceiling down</strong> (e.g. from 7′ up, so a cupboard fits under
              it). Drag the round ends to change it.
            </li>
            <li>It counts in the bricks, cement and paint. A wall standing on the floor also takes away tiles under it.</li>
          </ul>
        </section>
        <section>
          <h2>Plug points and switchboards</h2>
          <ul>
            <li>
              Tap <strong>Plug</strong>, then tap a wall. Select it to choose: <strong>Switchboard</strong>, <strong>Plug point</strong>, <strong>Power point (16A)</strong> or <strong>Switches only</strong>. Drag
              it along the wall.
            </li>
            <li>
              Once you've marked plugs, things that need electricity get warnings: "Study table is 7′ from the nearest plug point. Use a 10 ft extension cord", or "AC has no power point on its wall".
              Fridges, washing machines and geysers should have a plug close by (no extension cord).
            </li>
            <li>Any item can be set to need a plug in its settings (e.g. a bed where you charge your phone).</li>
            <li>
              Distances count the height too, like a real cable: an AC at 7′ and a plug at 1′ that are 4′ apart on the plan are √(4² + 6²) ≈ 7′ 2″ apart. Select the item to see "Nearest plug: 7′ 2″ (4′
              across, 6′ up)". For an AC, put its 16A point high, next to it.
            </li>
          </ul>
        </section>
        <section>
          <h2>Will it get in?</h2>
          <ul>
            <li>
              Put the main door on an outside wall. Then select something big (a sofa, fridge, cupboard) and tap the <strong>route</strong> button. RoomFit tries to carry it from the main door (or up the
              stairs) to its spot: straight, turned, on its side or lying flat.
            </li>
            <li>You see the way it goes. If it gets stuck, it tells you where, like "The way into the Bedroom is too tight". Tick "Other furniture is in the way" if the rest is already in.</li>
          </ul>
        </section>
        <section>
          <h2>My things</h2>
          <ul>
            <li>
              Select your own bed, cupboard, cycle… → <strong>Add to My things</strong>. They stay with your account for every home. Set how many you have (2 chairs).
            </li>
            <li>
              ⋯ More → <strong>My things</strong> → "Put all my things in this plan" puts them along the walls. "Which home fits my things?" checks all your homes and tells you what doesn't fit.
            </li>
          </ul>
        </section>
        <section>
          <h2>Roommates</h2>
          <ul>
            <li>
              ⋯ More → <strong>Roommates</strong>: add names. Each person gets a colour. "Draw … space" marks their part of the room. Select furniture → <strong>Belongs to</strong> to say whose it is.
            </li>
            <li>You get a warning if someone's things are in another person's space.</li>
            <li>
              A roommate can add their own things: send them the link, they save a copy, tap "This is me", add their things and send their link back. Open it and tap{' '}
              <strong>Bring in their things</strong>.
            </li>
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
          <h2>Building cost</h2>
          <ul>
            <li>
              ⋯ More → <strong>Building cost</strong> (or <strong>Cost</strong> at the top on a laptop/iPad). Four tabs: Bricks, Cement, Paint, Tiles, and the total at the bottom.
            </li>
            <li>
              <strong>Cement:</strong> bags for the mortar between bricks, the plaster on the walls and the bed under the floor tiles. Change the price of a bag, the mixes (like 1 : 6) and thicknesses.
            </li>
            <li>
              <strong>Paint:</strong> price of a litre, how many coats, and how much one litre covers (it's on the tin). Ceilings and outside walls can be added.
            </li>
            <li>
              <strong>Bricks:</strong> enter the size of one brick, the gap between bricks (mortar) and the price of one brick. RoomFit works out the bricks for the walls (up to each room's ceiling height,
              without doors and windows), the stairs and the ceiling. Untick what you don't want counted.
            </li>
            <li>
              <strong>Tiles:</strong> enter the tile size and price for all rooms. Any room can have its <strong>own tile</strong> or <strong>no tiles</strong> (e.g. parking). "Same tile everywhere" puts them all back.
            </li>
            <li>Everything is saved with the layout, and you can change it any time. Prices are examples until you change them.</li>
          </ul>
        </section>
        <section>
          <h2>Houses with more floors</h2>
          <ul>
            <li>Use the floor tabs at the top. Tap the current tab to rename or delete it, and + to add a floor.</li>
            <li>Add <strong>Stairs</strong> from the Structure section. The same space shows as a stair opening on the floor above.</li>
            <li>
              You can put anything over a stair opening: more stairs going up, a landing, or furniture where the floor is closed. You get a yellow warning so you can check it, and{' '}
              <strong>Let it be</strong> if it's how your home is built. Hanging lamps and fans over the stairs never give a warning.
            </li>
            <li>
              Stairs can be <strong>open underneath</strong> (in the stairs settings) so you can use the space below, e.g. a shelf or storage. Things fit where the stairs are high enough; you get a warning
              if something is too tall there.
            </li>
            <li>
              Upstairs, <strong>Rooms → Add floor over the stairs</strong> and drag over the part of the stair opening that has floor (usually over the low steps). You get a warning if the people
              going up have less than 6 ft of head room under it.
            </li>
            <li>
              Tap the current floor tab → <strong>Floor height</strong> to set the height from this floor to the next (slab included). By default it's the highest ceiling + 6″.
            </li>
          </ul>
        </section>
        <section>
          <h2>3D view</h2>
          <ul>
            <li>
              <strong>Measure in 3D:</strong> tap <strong>Measure</strong>, then tap two points (a plug, the AC, a wall, the floor…). You get the straight distance in 3D, with how much is across and how
              much is up.
            </li>
            <li>
              <strong>Add and move things in 3D:</strong> tap <strong>Add</strong> and pick an item. <strong>Drag any thing with one finger</strong> to move it across the floor (the view doesn't turn
              while you drag), or pick it and tap the floor where it goes. The bar at the bottom turns it, raises or lowers it (e.g. a suitcase on a cupboard), or deletes it. Dragging empty space still turns
              the view. It's the same plan as in 2D, and Undo works.
            </li>
            <li>Set the ceiling height in the room settings and the height of furniture to check tall things. Typical heights are used if you don't.</li>
            <li>
              Homes with more floors: pick <strong>All floors</strong> to see them stacked, or one floor on its own. Drag <strong>Space between floors</strong> to pull them apart and look inside. Stairs are shown as real
              steps going up through the opening.
            </li>
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
            <li>Log in with the same name on your phone and laptop and you see the same homes. Changes show up on the other device within a minute, or when you open the app.</li>
            <li>The round button with your first letter (top right) has log out and delete account.</li>
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
