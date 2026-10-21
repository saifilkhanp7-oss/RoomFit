# RoomFit — Product & Technical Spec

> A room planner for students and families shifting to a new hostel room, flat or house.
> Plan the room on screen first: will the bed fit next to the window, will the cupboard block the door, where should the study table go.

**Status:** Phases 1–7 built, plus version 2 (accounts, backend, hall/bathroom/balcony/parking/basement, vehicles), see section 14.
**Stack:** React + Vite frontend and Vercel Functions backend (deployed on Vercel from GitHub), Postgres database on Supabase.
**Hard rules:** No AI, no statistics, no charts. Simple and fast. Must work well on iPhone/iPad Safari, Android and laptop. (Login + backend were added in version 2 at the owner's request.)

---

## 1. Goals and non-goals

### Goals
- Plan one or many rooms to real scale, in feet or meters, on a top-down floor plan with grid lines.
- Support single-floor and multi-floor homes, with stairs that carry through to the floor above.
- Drag furniture in, move, rotate, snap, resize, recolour and label it.
- Warn clearly about overlaps, items outside the room, items in walls, items on stairs, items in door swings, and tight walking space.
- Optional heights + 3D view for single-floor plans, with height warnings.
- Everything saves automatically in the browser. Backups via share link, PNG export and backup file.
- Installable PWA that works offline.

### Non-goals (v1)
- No accounts, cloud sync or backend of any kind.
- No AI suggestions, auto-layout, statistics or charts.
- No non-rectangular rooms (L-shaped rooms, angled walls) — see Open Questions.
- No real-time collaboration (sharing is copy-based, not live).
- No 3D for multi-floor plans (heights/3D are single-floor only, as requested).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Home** | A place being planned, e.g. "Hostel Room 204", "Home". |
| **Layout** | One version of a home's plan, e.g. "Layout A", "Layout B". A home has 1+ layouts. |
| **Floor** | One level in a layout, e.g. "Ground Floor". Single-floor layouts have exactly one. |
| **Room** | A rectangle on a floor with an inner size (e.g. 12 ft × 10 ft). |
| **Wall** | The thick band around a room. Shared walls sit between two rooms. |
| **Opening** | A door or window placed on a wall. |
| **Item** | Any furniture or custom object placed on a floor. |
| **Stair opening** | Auto-created no-go zone on the floor above a staircase. |
| **Clearance** | Free walking space between two items. |

---

## 3. User flows

### 3.1 First open
1. Splash → **Home list** (empty state: "Plan your first room" button).
2. "New plan" dialog:
   - Home name (default "My Room")
   - Type: **Single floor** / **Multi-floor**
   - If multi-floor: number of floors (2–5). Floors are auto-named "Ground Floor", "First Floor", "Second Floor"…
   - Unit: **Feet** / **Meters** (can switch any time later)
   - First room size (width × length). Default 12 ft × 10 ft.
3. Opens the **Editor** with the first room centred.

### 3.2 Coming back
- If there is a saved plan, show a **"Continue your plan?"** card on open, with the last edited home + layout name and time ("Hostel Room 204 · Layout A · edited 2 hours ago").
  - **Continue** → opens editor where the user left off (same floor, same zoom).
  - **See all homes** → home list.

### 3.3 Opening a shared link
- Link format: `https://roomfit.vercel.app/#/s/<compressed-data>`
- Opens a **read-only viewer** with a banner: "This is a shared plan. **Save a copy** to edit it."
- "Save a copy" adds it as a new home on this device (never overwrites anything existing; name gets "(copy)" if needed).

---

## 4. Screens / pages

Routing is hash-based (works with static hosting and offline PWA).

| Route | Screen | Purpose |
|---|---|---|
| `#/` | **Home list** | All homes as cards; create, rename, duplicate, delete home; import backup; continue prompt. |
| `#/home/:homeId` | **Home detail** (sheet on mobile) | Layouts of this home: add, rename, duplicate, delete, switch. |
| `#/edit/:homeId/:layoutId` | **Editor** | The main planner. Floor tabs, canvas, panels. |
| `#/edit/:homeId/:layoutId/3d` | **3D view** | Only for single-floor layouts. Lazy-loaded. |
| `#/s/:data` | **Shared viewer** | Read-only view of a plan from a link, with "Save a copy". |
| `#/help` | **Help** | Short how-to, gestures, iPhone install guide, backup advice. |

### 4.1 Editor layout

**Desktop / iPad landscape**
```
┌─────────────────────────────────────────────────────────────┐
│ ← Home name ▾  Layout A ▾        ↶ ↷   📏  3D  ⤴ Share  ☀/🌙 │  top bar
├─────────────────────────────────────────────────────────────┤
│ [Ground Floor] [First Floor] [+]                            │  floor tabs (multi-floor only)
├──────────┬───────────────────────────────────┬──────────────┤
│ Furniture│                                   │ Properties   │
│ panel    │          Canvas (grid,            │ (selected    │
│ (search, │          rooms, items)            │  item/room)  │
│ category)│                                   │ ──────────── │
│          │                                   │ Warnings (3) │
└──────────┴───────────────────────────────────┴──────────────┘
```

**Phone (portrait)**
```
┌───────────────────────────┐
│ ← Name ▾      ↶ ↷  ⋯  ☀/🌙│  top bar (safe-area aware)
│ [Ground] [First] [+]      │  floor tabs, scroll horizontally
├───────────────────────────┤
│                           │
│        Canvas             │
│                           │
│                ⚠ 3        │  warnings badge (tap to open)
├───────────────────────────┤
│ [+ Add] [Room] [📏] [⋯]   │  bottom toolbar (above home indicator)
└───────────────────────────┘
```
- Furniture panel, properties and warnings open as **bottom sheets** on phone.
- When an item is selected, a **floating action bar** appears near it: rotate −90°, rotate +90°, duplicate, delete, edit.

---

## 5. Features in detail

### 5.1 Homes and layouts
- Multiple homes. Each home has a name and 1+ layouts.
- Layouts: add (blank or **duplicate current**), rename, delete (with confirm), switch.
- **Compare:** a quick switcher in the top bar flips between layouts instantly, keeping the same zoom and floor so the user can compare "Layout A" vs "Layout B".
- A layout holds its own floors, rooms, openings and items. (Single vs multi-floor is chosen per home and shared by all its layouts. Floor count can be changed later.)

### 5.2 Units
- Global toggle **ft / m** in the editor (and in settings). Switching never changes real sizes, only how they are shown and typed.
- Internally everything is stored in **millimetres (integers)** to avoid rounding drift.
- Feet display: `12′ 6″`. Input accepts `12.5`, `12'6`, `12 ft 6 in`, `150 in`.
- Meters display: `3.81 m`. Input accepts `3.81`, `381 cm`.
- Wall thickness inputs show inches/cm (e.g. `9″` / `23 cm`).

### 5.3 Floors (multi-floor)
- Floor tabs at top: "Ground Floor", "First Floor", … plus "+" to add a floor.
- Rename floor (long-press on phone / double-click on desktop / "Rename" in tab menu — no hover needed).
- Reorder isn't needed in v1 (floors are stacked in order). Delete floor with confirm.
- All floors share **one coordinate system**, so the same (x, y) is the same spot on every floor. This is what makes stair openings line up.
- Optional **"ghost" of floor below** (faint outline) to help line up rooms on upper floors. Toggle in view options.

### 5.4 Rooms and walls
- Add room: name (e.g. "Bedroom", "Kitchen"), inner width × length.
- **Rectangle rooms only** in v1.
- **Placing rooms side by side:**
  - When adding a 2nd+ room, choose "Attach to: [Room] on [Left / Right / Top / Bottom]" and an offset along that side (default: aligned to the corner).
  - The app places the new room so there is exactly one wall thickness between them.
  - Rooms can also be dragged; they snap so the gap to a neighbour equals the shared wall thickness.
- **Wall thickness:**
  - Outer wall thickness per floor (default 9″ / 23 cm, can be set to 0 to hide).
  - Each **shared wall** between two rooms has its own thickness (choices: 4.5″, 6″, 9″, custom). Editable by tapping the wall.
- Room can be resized from the properties panel (exact numbers) or by dragging edge handles (snaps to 1″ / 1 cm, or to grid).
- Room label + inner size shown in the middle of the room (e.g. "Bedroom · 12′ × 10′").
- Grid: 1 ft or 0.5 m minor lines, darker lines every 5 ft / 1 m. Grid can be hidden.

### 5.5 Doors and windows
- Tap a wall → "Add door" / "Add window" (also available in the add panel, then tap a wall).
- Position: offset from the wall's start corner, editable as a number, or drag along the wall.
- **Door:** width (default 3 ft / 90 cm), hinge side (left/right), opens **into** room A or room B (or in/out for outer walls). Type: single swing, double swing, sliding (no swing area), or plain opening (no door).
  - Draws the door leaf and the **swing arc** (quarter circle) as a light shaded area.
- **Window:** width, and (for 3D/height checks) sill height from floor and window height.
- Doors on shared walls belong to both rooms (connect them).
- Openings cannot overlap each other or go past wall ends (blocked with a message).

### 5.6 Stairs (multi-floor)
- Stairs are an item in the furniture panel (only shown for multi-floor homes).
- Types: **Straight**, **L-shape**, **U-shape**. Settings: total width/length, flight width, which way it goes up (arrow shown), and which corner the turn is for L/U.
- Drawn with step lines and an "UP" arrow.
- **Stair opening on floor above:** when stairs are placed on floor N, the same footprint automatically appears on floor N+1 as a hatched **"Stair opening"** zone, locked in place (can't be moved there; edit the stairs on the lower floor instead). Moving, resizing or deleting the stairs updates the opening instantly.
- Stairs on the top floor show a small note: "No floor above for this staircase."
- Any item touching stairs or a stair opening → red warning.

### 5.7 Furniture panel
- Categories with search box. Each item has a real default size (editable after placing):

| Category | Items (default size W × D) |
|---|---|
| Beds | Single bed 3′×6′6″, Double bed 4′6″×6′6″, Queen 5′×6′8″, Bunk bed 3′×6′6″ (height 5′6″) |
| Study | Study table 4′×2′, Chair 1′8″×1′8″, Bookshelf 2′6″×1′ |
| Storage | Cupboard/wardrobe 3′×2′ (height 6′6″), Shelf 2′×1′, Shoe rack 2′×1′, Chest of drawers 2′6″×1′6″ |
| Living | Sofa (2-seat) 5′×2′9″, Bean bag 2′6″ round, Coffee table 3′×1′6″, TV unit 4′×1′4″ |
| Kitchen/Dining | Fridge 2′×2′2″ (height 5′6″), Dining table (4) 4′×2′6″, Stove counter 4′×2′ |
| Other | Cooler 1′6″×1′6″, Mirror 2′×4″, Dustbin 1′ round, Ceiling fan 4′ round (ceiling-mounted), Rug 5′×3′ |
| Structure | Stairs (multi-floor only), Pillar, Bathroom block |
| Custom | "+ Custom item": name + width + depth (+ optional height, shape rect/round) e.g. "my guitar", "cycle" |

- **Adding items:**
  - Desktop/tablet: drag from panel and drop on canvas.
  - Phone: drag from the bottom sheet onto canvas, **or simply tap** an item to drop it in the centre of the current view (more reliable on small screens).
- Custom items are remembered in a **"My items"** section for reuse in any home.
- Items are drawn as simple top-down shapes with a small icon and label (beds show a pillow, sofa shows seat back, etc.).

### 5.8 Editing items
- **Select:** tap. Selected item shows outline, rotation handle and floating action bar.
- **Move:** drag with one finger / mouse. Arrow keys nudge on desktop (Shift = larger step).
- **Rotate:** −90° / +90° buttons; free rotation by dragging the rotation handle (snaps to 15° when close, hold Shift / toggle "free" to disable).
- **Snapping:**
  - Snap to walls (item's edge lands flush with the inner wall face, and auto-rotates its back to the wall for beds/cupboards when dropped near a wall — can be turned off).
  - Snap to other items (edges align / touch).
  - Snap guides shown as thin lines while dragging. Snap distance ~ 6″ / 15 cm on screen-scaled basis.
  - Global "Snap" toggle.
- **Properties:** name/label, width, depth, (height), rotation in degrees, colour (palette of ~12 colours + custom), lock position.
- **Undo / Redo** (buttons + Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z). History up to 100 steps per layout (session only).
- **Delete** and **Duplicate** (duplicate places a copy offset slightly).
- Multi-select is not in v1 (keeps touch UI simple).

### 5.9 Warnings
Checked live after every change. Shown on canvas and in the warnings list.

| Level | Rule | Shown as |
|---|---|---|
| 🔴 Red | Two items overlap (except rugs and ceiling fans, which are allowed under/over things) | Red fill on both |
| 🔴 Red | Item partly or fully outside its room | Red fill |
| 🔴 Red | Item inside a wall | Red fill |
| 🔴 Red | Item on stairs or on a stair opening | Red fill |
| 🔴 Red | Item inside a door swing area | Red fill + swing arc turns red |
| 🟡 Yellow | Walking space between two items is more than 0 but less than **2 ft (60 cm)** | Yellow dashed line between them with the gap value |
| 🔴 Red (3D) | Item taller than ceiling | See 5.11 |
| 🟡 Yellow (3D) | Tall item blocking a window | See 5.11 |
| 🟡 Yellow (3D) | Bunk bed / tall item too close to ceiling fan | See 5.11 |

- Warnings list (side panel / bottom sheet): "🔴 Cupboard overlaps door swing (Bedroom)". Tapping a warning selects and zooms to the item.
- The minimum walking space (default 2 ft) can be changed in settings.
- Small/flush items placed intentionally against each other (gap = 0) are **not** a yellow warning — only gaps that are too small to walk through but not touching.

### 5.10 Measuring
- **Measure tool:** tap point A then point B → line with distance label. Points snap to wall corners, wall faces and item corners. Measurements stay until cleared ("Clear measurements"). Multiple measurements allowed.
- **Selected item distances:** when an item is selected, show dimension lines from each side of the item to the nearest wall in that direction (up to 4), with values. Updates live while dragging.

### 5.11 Heights and 3D (single-floor only, optional)
- In room properties: **ceiling height** (default 10 ft / 3 m, optional).
- Window: sill height and window height.
- Items: optional height. Some items have defaults (cupboard 6′6″, bunk bed 5′6″, fridge 5′6″, shelf 4′). Ceiling fan has "hang height" (default: 1 ft below ceiling).
- If the user never enters heights, nothing changes — 2D works fully and the 3D button just uses defaults (with a note "heights are estimates").
- **3D view:**
  - Simple boxes for items (with item colour), floor, walls (cut to ~waist height optional toggle "Cut walls" to see inside), windows as openings, doors as openings.
  - Orbit with one finger, pinch to zoom, two fingers to pan. "Reset view" button. Top / corner preset views.
  - Read-only (editing happens in 2D) — keeps it simple and stable on phones.
- **Height warnings:**
  - Item height ≥ ceiling height → red.
  - Item in front of a window (within ~1 ft of that wall and overlapping the window horizontally) and its height > sill height → yellow "Cupboard covers part of the window".
  - Bunk bed (or any item) under a ceiling fan's circle with vertical gap between item top and fan < **3 ft (90 cm)** → yellow "Bunk bed too close to ceiling fan". (Threshold editable in settings.)

### 5.12 Saving, sharing and backup
See section 7 for data details.
- **Autosave** to browser storage after every change.
- **Share link** — plan in the URL. On tap, the user picks "This layout only" or "Whole home". If too big → message: "This plan is too big for a link. Use **Download backup** instead."
- **Export PNG** — per floor. Includes room names, dimensions, item labels, and a small footer (home · layout · floor · scale). Choose: current floor / all floors (one PNG each).
- **Backup file** — download `.roomfit.json` with all homes (or just the current home). **Import** reads the file, validates it, and adds homes (asks "Replace" or "Add as copies" if names/ids clash).

### 5.13 Settings (small sheet)
- Units (ft/m), theme (light/dark/system), min walking space, fan clearance, snap on/off, show grid, show dimensions.
- "Download backup of everything" and "Delete all data" (double confirm).

### 5.14 Theme
- Light/dark toggle icon (☀/🌙) in the top bar of every page. First load follows the system setting. Choice saved.

---

## 6. iPhone / iPad (Safari) requirements

| Need | How it will be handled |
|---|---|
| Smooth drag, rotate, pinch-zoom, two-finger pan | Use **Pointer Events** everywhere with our own gesture handling (one pointer = drag/select, two pointers = pinch + pan). `touch-action: none` on the canvas. Canvas rendering via Konva (GPU-friendly). Throttle redraws with `requestAnimationFrame`. |
| Page must not scroll or zoom while dragging | `touch-action: none` on canvas; `overscroll-behavior: none` on body; prevent `gesturestart`/`gesturechange` (Safari pinch) on the canvas; viewport `maximum-scale=1` is **not** relied on alone (iOS ignores it for accessibility), so gestures are blocked at the event level. Disable long-press text selection/callout (`-webkit-user-select: none`, `-webkit-touch-callout: none`) on the canvas. |
| No hover-dependent features | Every action is reachable by tap. Tooltips appear on long-press/tap, not hover. Renaming via menu, not double-click only. Check with a "no hover" review on every component. |
| Install guide on iPhone | Detect iOS Safari not in standalone mode → small dismissible banner: "Install RoomFit: tap **Share** ⬆️ then **Add to Home Screen**." (with a small picture). On Android/desktop use the normal `beforeinstallprompt` install button. |
| Safari may delete storage after ~7 days of not visiting | On iOS (not installed) show a gentle reminder: "Safari can delete saved plans if you don't open this site for a few days. **Add to Home Screen** or **Download backup** to keep them safe." Shown on first save and then at most once a week. Also call `navigator.storage.persist()` where supported. Show "Last backup: never / 3 days ago" in settings. |
| PNG export and backup download on iPhone | Use `navigator.share({ files })` (Web Share with files, iOS 15+) to open the share sheet ("Save Image", WhatsApp, Files…). Fallback: `<a download>` and, if that fails, open the image in a new tab with "Long-press to save". |
| Import backup on iPhone | Standard `<input type="file">` which opens the Files picker. Accept `.json` and `application/json` (iOS may label the file differently, so don't filter too strictly). |
| Notch and home indicator | `viewport-fit=cover` + `env(safe-area-inset-*)` padding on top bar, bottom toolbar, sheets and floating buttons. Use `100dvh` (with fallback) instead of `100vh` so Safari's moving address bar doesn't hide the toolbar. |
| 3D smooth, no crash | 3D page lazy-loaded (not downloaded until needed). Low-poly boxes, no shadows/post-processing, device pixel ratio capped at 2, render only on change (`frameloop="demand"`), dispose geometries on leave, handle WebGL context loss with a "Reload 3D" message. |
| Input fields not zooming page | All inputs at least 16px font size (iOS zooms into smaller inputs). Numeric inputs use `inputmode="decimal"`. |
| Testing on Safari | See section 11. |

---

## 7. Data model and storage

### 7.1 Types (TypeScript)
All lengths in **millimetres** (integers). Angles in degrees. Coordinates in floor space, origin top-left, y down.

```ts
type Unit = 'ft' | 'm';

interface AppData {
  schemaVersion: number;          // starts at 1, for future migrations
  homes: Home[];
  customItemTemplates: ItemTemplate[]; // "My items"
  settings: Settings;
  lastOpened?: { homeId: string; layoutId: string; floorId: string; at: number };
}

interface Home {
  id: string;
  name: string;
  kind: 'single' | 'multi';
  layouts: Layout[];
  createdAt: number;
  updatedAt: number;
}

interface Layout {
  id: string;
  name: string;                   // "Layout A"
  floors: Floor[];                // ordered bottom → top
  view?: { floorId: string; zoom: number; panX: number; panY: number };
}

interface Floor {
  id: string;
  name: string;                   // "Ground Floor"
  outerWallMm: number;            // default 230 (9")
  rooms: Room[];
  sharedWalls: SharedWall[];      // thickness between pairs of rooms
  openings: Opening[];
  items: Item[];
}

interface Room {
  id: string;
  name: string;
  x: number; y: number;           // inner top-left corner
  width: number; length: number;  // inner size
  ceilingMm?: number;             // optional, single-floor only
}

interface SharedWall {
  id: string;
  roomA: string; roomB: string;
  side: 'left' | 'right' | 'top' | 'bottom'; // side of roomA
  thicknessMm: number;
}

interface Opening {
  id: string;
  kind: 'door' | 'window';
  roomId: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  offsetMm: number;               // from the side's start corner
  widthMm: number;
  // door
  doorType?: 'swing' | 'double' | 'sliding' | 'opening';
  hinge?: 'start' | 'end';
  opensInto?: 'this' | 'other';   // other room, or outside
  // window
  sillMm?: number;
  heightMm?: number;
}

interface Item {
  id: string;
  type: string;                   // 'bed-single', 'cupboard', 'stairs', 'custom', ...
  label: string;
  x: number; y: number;           // centre
  width: number; depth: number;
  rotation: number;               // degrees, 0–360
  shape: 'rect' | 'round';
  color: string;
  heightMm?: number;
  mount?: 'floor' | 'ceiling' | 'under'; // fan = ceiling, rug = under
  locked?: boolean;
  stairs?: { style: 'straight' | 'L' | 'U'; flightWidthMm: number; turn: 'left' | 'right'; upDir: 0 | 90 | 180 | 270 };
}
// Stair openings are NOT stored: computed from stairs on the floor below.

interface ItemTemplate { id: string; type: string; label: string; width: number; depth: number; heightMm?: number; shape: 'rect' | 'round'; color: string; }

interface Settings {
  unit: Unit;
  theme: 'light' | 'dark' | 'system';
  minWalkMm: number;              // 610 (2 ft)
  fanClearanceMm: number;         // 915 (3 ft)
  snap: boolean; showGrid: boolean; showDims: boolean;
  lastBackupAt?: number;
  iosReminderDismissedAt?: number;
}
```

### 7.2 Autosave (local storage)
- Key: `roomfit:v1:data` holds the whole `AppData` as JSON. (A typical home is a few KB; localStorage gives ~5 MB, enough for hundreds of homes.)
- Save is **debounced ~300 ms** after each change, and forced on `visibilitychange` (hidden) and `pagehide` (important on iOS, where `beforeunload` is unreliable).
- Undo/redo history is kept in memory only (not saved).
- Writes are wrapped in try/catch; if storage is full or blocked (private mode), show a banner: "Can't save in this browser. Download a backup to keep your plan."
- `schemaVersion` + small migration functions so old saved plans keep working after updates.
- Multiple tabs: listen to the `storage` event and show "Plan changed in another tab — reload?" to avoid overwriting.

### 7.3 Share link
- Take the **current layout** or the **whole home** — the app asks the user each time they share → strip view state → JSON → **lz-string** `compressToEncodedURIComponent` → put after `#/s/`.
- Using the URL **hash** means the data never goes to the server (private, and no server URL length limits).
- Size limit: if the final URL is over **~8,000 characters**, don't create it; show the "too big, use backup file" message. (Most hostel/flat plans will be 1–3 K characters.)
- On iPhone/Android use `navigator.share({ url })`; on desktop copy to clipboard with a "Link copied" toast.
- Opening a link validates the data (zod) before showing it; bad/broken links show a friendly error.

### 7.4 Backup file
- File name: `roomfit-backup-2026-10-20.roomfit.json` (or `roomfit-<home-name>.roomfit.json`).
- Content: `{ app: 'roomfit', schemaVersion, exportedAt, homes, customItemTemplates }`.
- Import: validate with zod → migrate if older version → ask Add/Replace on clash → save.

### 7.5 PNG export
- Rendered from the Konva stage at fixed high resolution (e.g. 2× pixel ratio, fit to floor bounds + margin), always on a light background so it prints well, with warnings layer hidden by default (toggle "include warnings").

---

## 8. Libraries

| Purpose | Library | Why |
|---|---|---|
| App | **React 18 + Vite + TypeScript** | Requested stack; TS helps a lot with geometry and the data model. |
| 2D canvas | **Plain HTML canvas** (own renderer, `src/editor/canvas/draw.ts`) | Changed from Konva during the build: lighter (~50 KB less), faster on phones, and the same drawing code makes the PNG export. |
| Gestures | Own pointer-events handler (small hook) | Full control over Safari pinch/pan/drag conflicts. (Fallback option: `@use-gesture/react`.) |
| State | **Zustand** | Small and simple global store. |
| Undo/redo | Own per-layout history in the store | One undo step per drag (zundo couldn't group drag frames cleanly). |
| 3D | **three + @react-three/fiber** (three's own OrbitControls) | Lazy-loaded so it doesn't slow the first load. drei not needed. |
| Share link compression | **lz-string** | Small, URL-safe compression. |
| Validation | Own small sanitizer (`src/storage/sanitize.ts`) | Safe parsing of imported files and share links without the extra library. |
| PWA | **vite-plugin-pwa** (Workbox) | Manifest, service worker, offline caching, update prompt. |
| Routing | **react-router (HashRouter)** or a tiny custom hash router | Works on static hosting/offline. |
| Icons | **lucide-react** | Clean, tree-shakable icons. |
| IDs | **nanoid** | Short unique ids. |
| Styling | Plain CSS with CSS variables (CSS Modules) | Light/dark themes with variables, no heavy UI library, fast. |
| Testing | **Vitest** (geometry/warnings/units/storage), **Playwright** (WebKit + iPhone/iPad emulation, Chromium, Android emulation) | Automated checks, including Safari's engine. |

No UI component library, no analytics, no tracking, no fonts from external servers (system font stack) — keeps it fast and fully offline.

---

## 9. Project structure (planned)

```
roomfit/
├─ public/            icons, apple-touch-icon, manifest images, iOS install guide image
├─ src/
│  ├─ main.tsx, App.tsx, router.tsx
│  ├─ model/          types.ts, defaults.ts, catalog.ts (furniture list), migrations.ts, schema.ts (zod)
│  ├─ store/          useAppStore.ts (zustand + zundo), selectors.ts
│  ├─ geometry/       units.ts, rect.ts (rotated-rect SAT overlap), walls.ts, doors.ts, stairs.ts,
│  │                  snapping.ts, distances.ts, warnings.ts, heightWarnings.ts
│  ├─ storage/        local.ts (autosave), shareLink.ts, backupFile.ts, exportPng.ts, shareSheet.ts
│  ├─ editor/
│  │  ├─ canvas/      PlanCanvas.tsx, GridLayer, RoomLayer, WallLayer, OpeningLayer, ItemLayer,
│  │  │               StairOpeningLayer, WarningLayer, MeasureLayer, DimensionLayer, SnapGuides
│  │  ├─ gestures/    usePointerGestures.ts (drag, pinch, pan, rotate handle)
│  │  ├─ panels/      FurniturePanel, PropertiesPanel, WarningsPanel, RoomDialog, OpeningDialog,
│  │  │               StairsDialog, CustomItemDialog
│  │  ├─ FloorTabs.tsx, TopBar.tsx, BottomToolbar.tsx, ItemActionBar.tsx
│  ├─ three/          View3D.tsx (lazy), Room3D, Item3D, Window3D
│  ├─ pages/          HomeList, HomeDetail, Editor, SharedViewer, Help
│  ├─ components/     Sheet (bottom sheet), Dialog, Toast, ThemeToggle, UnitInput, IosInstallBanner,
│  │                  StorageReminder, ContinuePrompt
│  ├─ hooks/          usePlatform (iOS/standalone detection), useAutosave, useTheme
│  └─ styles/         theme.css, base.css
├─ tests/             unit (vitest), e2e (playwright)
├─ vercel.json        SPA fallback + cache headers
├─ index.html         viewport-fit=cover, apple meta tags, theme-color
└─ spec.md
```

---

## 10. Phases

Each phase ends with a working app that can be deployed to Vercel and tried on a phone.

### Phase 1 — Foundation and a single room
- Vite + React + TS project, folder structure, Vercel config, GitHub-ready.
- Data model, Zustand store, local storage autosave, schema version.
- Home list (create/rename/delete home), new plan dialog (single/multi choice saved; multi-floor UI comes in Phase 4).
- Editor with one room: grid, room drawn to scale with walls, room size editing.
- Units ft/m with parsing/formatting.
- Pan and pinch-zoom on canvas (touch + mouse + trackpad), no page scroll/zoom on iOS.
- Light/dark toggle, safe-area layout, responsive shell (top bar, bottom toolbar, sheets).
- "Continue your plan?" prompt.

### Phase 2 — Furniture
- Furniture panel with catalog and search; drag-drop (desktop) and tap-to-add (phone).
- Select, move, rotate (±90° and free), resize, colour, label, lock.
- Snap to walls and items with guides.
- Custom items + "My items".
- Undo, redo, delete, duplicate.
- Layouts: add, duplicate, rename, delete, switch/compare.

### Phase 3 — Doors, windows, warnings, measuring
- Doors (types, hinge side, direction, swing arc) and windows on walls.
- Warning engine: overlap, outside room, in wall, in door swing, walking space < 2 ft.
- Red/yellow highlights + warnings list (tap to jump to item).
- Measure tool with snapping; distance-to-walls for the selected item.

### Phase 4 — Multiple rooms and multiple floors
- Add more rooms, attach to a side with offset, drag-snap with wall gap.
- Shared wall thickness editing; outer wall thickness.
- Doors on shared walls between rooms.
- Floor tabs: add, rename, delete floors; floor-below ghost outline.
- Stairs item (straight/L/U) + automatic stair opening on the floor above; stairs warnings.

### Phase 5 — Saving, sharing, PWA, iOS polish
- Share link (lz-string in hash) + shared read-only viewer + "Save a copy" + too-big message.
- PNG export per floor (share sheet on iOS/Android).
- Backup file download/import with validation and migrations.
- PWA: manifest, icons, service worker, offline, update prompt, install button (Android/desktop).
- iOS install guide banner and storage reminder; `navigator.storage.persist()`.
- Multi-tab protection.

### Phase 6 — Heights and 3D (single floor)
- Ceiling height, window sill/height, item heights with sensible defaults; ceiling fan item.
- Lazy-loaded 3D view with orbit/pinch/pan, cut-walls toggle, preset views, context-loss handling.
- Height warnings: taller than ceiling, blocking window, too close to fan.

### Phase 7 — Testing and final polish
- Full test pass (section 11), performance tuning, accessibility pass, help page, empty states, small animations, final bug fixes.

---

## 11. Testing plan

**Automated**
- Vitest unit tests for: unit parsing/formatting, rotated-rectangle overlap, wall/door/stair geometry, snapping, distances, every warning rule, share-link encode/decode + size limit, backup validation and migrations.
- Playwright end-to-end on **WebKit (Safari engine)** with iPhone 13/15 and iPad emulation, plus Chromium desktop and Android (Pixel) emulation: create plan → add rooms/items → warnings appear → reload → plan still there → share link opens same plan → export/backup → import.
- Lighthouse PWA + performance check on the Vercel preview.

**Real device checklist (must be done by you on a real iPhone/iPad)**
Emulated WebKit is close to Safari but not identical — especially for touch gestures, the share sheet, Add to Home Screen and storage behaviour. I can't run a real iPhone from here, so I'll give you a short checklist for each phase to try on your phone after deploying the Vercel preview:
- Drag/rotate/pinch/two-finger move feel smooth; page never scrolls or zooms by mistake.
- Every button works without hover; inputs don't zoom the page.
- Toolbar not hidden behind notch / home indicator, in portrait and landscape.
- Add to Home Screen → opens full screen, works in airplane mode.
- PNG export and backup download open the share sheet and save correctly; import from Files works.
- Share link opens correctly from WhatsApp (in-app browser and Safari).
- 3D view opens, rotates smoothly, and going back and forth several times doesn't crash.

"Done" for each phase = automated tests pass + you confirm the device checklist.

---

## 12. Performance targets
- First load under ~250 KB gzipped JS (3D bundle loaded separately only when opened).
- Dragging at 60 fps on a mid-range phone with ~50 items.
- Warning checks under 5 ms per change for ~100 items (simple bounding-box pre-check before exact overlap test).

---

## 13. Decisions (answered)
1. **Rectangle rooms only** in v1 (L-shaped rooms may come later).
2. **TypeScript** is used.
3. Share link: when the user taps Share, the app **asks every time**: "Share this layout only" or "Share the whole home (all layouts)".
4. Defaults confirmed: **2 ft** minimum walking space, **3 ft** fan clearance (both editable).
5. 3D and height checks stay **single-floor only**. On multi-floor homes, stairs and stair openings are still checked in 2D (red warning if furniture sits on them).
6. URL: `roomfit.vercel.app` if free, otherwise any available name.

---

## 14. Version 2 (added later)

### 14.1 Accounts (name + password)
- **Sign up:** name box. While typing, the app checks the name. If it's taken, a red message appears *above* the box: "This name already exists, sign up with a different name". Names are compared ignoring case and extra spaces. When the name is free, **Password** and **Verify password** boxes appear, each with an eye button to show or hide it. Minimum 8 characters.
- **Recovery code:** after sign up, a one-time code like `K7QX-9MNP-2HTR-WC4D` is shown once. The user must tick "I have written down…" to continue. It can be used *once* on any device (Log in → "Forgot password?") with the name to set a new password; a new code is then shown. A new code can also be made from the Account menu (needs the password).
- **Log in:** name + password in one frame. Messages: "No account with this name…", "Wrong password for this name". After 8 wrong tries the name is locked for 15 minutes.
- **Lifetime access on the device:** a random device token in an HttpOnly, Secure, SameSite=Lax cookie (400 days, renewed every time the app opens), stored only as a SHA-256 hash in the database. The logged-in user is also remembered on the device, so the app opens offline.
- **Account menu** (round button with the first letter): sync status, Sync now, new recovery code, log out on this device (warns if changes aren't synced yet), delete account (needs the password).
- Shared links can be viewed without logging in; "Save a copy" asks to log in.

### 14.2 Backend and database
- `api/*.ts` – Vercel Functions (Web `Request`/`Response`), code in `server/`.
- Supabase Postgres via `DATABASE_URL` (transaction pooler). Tables: `rf_users`, `rf_sessions`, `rf_homes` (one JSON row per home, newest change wins, `rev` sequence for "what changed since"), `rf_user_state` ("My items"). RLS on, no policies → only the backend can read them. Schema in `server/schema.sql`, also applied automatically.
- Passwords: scrypt (N=16384, r=8, p=1, 16-byte salt). Recovery code: ~78 bits random, stored as SHA-256.
- Incoming plans are cleaned with the same sanitizer as backup files before saving.
- Local development: `npm run dev` runs the API inside Vite with PGlite (real Postgres in Node) in `.localdb`, so no Supabase account is needed to try it.

### 14.3 Sync
- Plans are saved in the browser first (per account), then sent to `/api/sync` about 1.5 s after a change, on app open, when coming back online or to the app, and every 60 s.
- Each device remembers which version of each home the cloud has. It sends only changed homes and deletions, and gets back everything changed since its last sync.
- Plans made before logging in on a device are moved into the account on first login.

### 14.4 Hall / lobby, room types, rooms inside rooms
- A room can sit **inside** another room. **Hall / lobby** = the whole home's size with rooms inside; the space left over is the hall. It's split into a few rectangles with sizes shown on the plan and in the room sheet (e.g. `6′ × 10′ + 6′ × 2′`, minus the room walls).
- Room types: Room, Hall / Lobby, Bathroom (tile pattern), Kitchen, Balcony (lighter railing; 1 m high in 3D), Parking / Garage, Store room. Add a room *inside* a room/hall in a chosen corner, or *next to* a room.
- Walls: a room inside another uses an inside wall (4.5″ default) except where it touches the outside, where the outer wall counts.
- Moving a room moves the rooms and furniture inside it. Deleting a room keeps the rooms inside it.
- Furniture in the hall snaps to the room walls from outside. Distances stop at those walls.

### 14.5 Basement and vehicles
- Floors menu: *Floor above* or *Basement / underground parking below* (adds a "Basement" floor with a Parking space as big as the floor above). Single-floor homes can be turned into multi-floor homes this way.
- New catalog groups: **Bathroom** (toilet, wash basin, shower area, washing machine) and **Vehicles** (hatchback 3.8×1.7 m, sedan 4.5×1.75 m, SUV 4.6×1.85 m, motorbike, scooter, bicycle).
- Door type **Shutter** (garage), the default for doors added to parking spaces.
- Vehicle warnings: no space to open the car doors (needs 2 ft on at least one side), and the space's widest door/gate narrower than the vehicle + 30 cm (15 cm for two-wheelers). Overlap/outside/in-wall warnings apply as for furniture.

## 15. Stacking and height from floor (added later)

- Every item has `elevationMm` (height from floor, default 0) and a height. Its vertical span is elevation → elevation + height.
- `openBelowMm`: open space under items on legs (hostel cot 1′2″, study table 2′3″, chair 1′4″…). 0 = closed (box bed, cupboard). Set in the item panel: Underneath → Open (legs) / Closed.
- `wallMounted`: shelves, mirrors (or any item ticked "Fixed to the wall") may hang in the air.
- Overlap: two items overlapping on the plan are fine if one sits on top of the other (30 mm tolerance) or one fits fully in the other's open space. Otherwise red: "X (h tall) doesn't fit under Y (open space)" or "A overlaps B", with the fix "Put A on top of B".
- In the air: an item above the floor with nothing under it and not fixed to the wall → yellow, with fix "Put it on top of …" or "Put it on the floor".
- Door swing, walking space and ceiling/window/fan checks use the vertical span (items above the door height don't block the swing; only floor items count for walking).
- **Let it be**: any warning can be accepted. Stored per floor in `okWarnings` (warning ids); shown under "Let be (n)" with "Show warning again". Accepted warnings don't colour the plan.
- Plan: stacked items are drawn above, with a "↑ height" badge; open items show leg dots. Tapping picks the top item. 3D: items start at their elevation; open items are a top plus four legs.
- New catalog items: suitcase, box / carton, stool.

## 16. 3D for multi-floor homes and the stair opening (added later)

- 3D is available for every home. Multi-floor homes get a floor picker in 3D: **All floors** (default) or one floor. "All" stacks the floors at their real levels with a "Space between floors" slider (0–3 m) to pull them apart; "Cut walls" works on all floors.
- Levels: floors are stored bottom → top; the first floor that isn't a basement is ground (level 0); basements are below. When basements are shown the ground is see-through.
- `Floor.floorHeightMm`: floor-to-floor height (set from the floor tab → Floor height). Default = highest ceiling on the floor + 150 mm slab.
- Each upper floor has a slab under it with a hole where the stairs from the floor below come up. Stairs are drawn as real steps (straight, L, U, with landings) rising to the floor above (or to the ceiling on the top floor).
- Height checks (ceiling, window, fan) now run on multi-floor homes too.
- Over the stair opening from the floor below: any item may be placed. It gets a **yellow** warning that can be let be: stairs → "fine if the stairs go on up, check the head room"; anything else → "fine only if the floor is closed there". Ceiling things (fans, the new **Hanging lamp**) never warn there.
- Hanging lamp: a ceiling item that hangs 2 ft below the ceiling. It only warns if something touches it (fans keep the 3 ft clearance).

## 17. Bricks & tiles cost, open stairs (added later)

- **Open stairs:** `stairs.open`. In 3D each step is a 250 mm slab, open below. Something overlapping open stairs is fine if its top is below the lowest step underside over it; otherwise red "doesn't fit under the stairs there". Closed stairs: "X is on the stairs" as before.
- **Cost screen** (More → Bricks & tiles cost; "Cost" in the top bar on wide screens). Settings are saved on the layout (`Layout.estimate`), synced and shared with it, and checked on load.
- **Bricks:** brick L × W × H, gap (mortar joint), price, extra % (default 5). Bricks = volume ÷ ((L+gap)(W+gap)(H+gap)) × (1 + extra), rounded up per part.
  - Walls: every wall box up to the room's ceiling (railing for balconies), doors and windows cut out; overlapping boxes (shared walls, corners) counted once (exact union of boxes).
  - Stairs: the volume of the steps (solid when closed, slabs when open), rising to the floor above.
  - Ceiling / roof: the area of the outer rooms with their walls (not balconies) × thickness (default 125 mm), minus the stair hole when there's a floor above.
  - Defaults: 190 × 90 × 90 mm, 10 mm gap (500 per m³); 9″ × 4½″ × 3″ for feet users. Price ₹8 (example).
- **Tiles:** one tile for all rooms (L × W, gap, price) + extra % (default 10). Each room: Same tile / Own tile / No tiles. Area = room floor without rooms inside it and stair openings. Tiles per room are rounded up.
- Currency: ₹ (default), $, €, £. Grand total = bricks + tiles. Mortar, cement and labour are not included.

## 18. Inner walls, paint & cement, will it get in, my things, roommates (added later)

**Inner walls** (`Floor.partitions`): a straight wall between two points, any angle (snaps to walls/corners, straightens near 0°/90°), thickness (default 4½″), `bottomMm` (0 = on the floor) and `topMm` (unset = up to the room's ceiling). Presets: Full wall, Half wall (3′), From the ceiling down (7′ up). Drawn hatched when not full; walls higher up are drawn over furniture with a dashed outline. Warnings: a thing that reaches into the wall's height range is red ("goes into the inner wall" / "doesn't fit under the inner wall"). 3D: a box at its height. Costs: bricks (length × thickness × height), both faces in paint and plaster, footprint taken off tiles when it stands on the floor.

**Cement:** bags (50 kg = 0.0347 m³) = wet volume × 1.33 ÷ (1 + mix) ÷ 0.0347 for: brick mortar (brickwork volume − bricks without the gap; mix 1:6), plaster (inside faces + inner walls (+ outside) × 12 mm; 1:4), tile bed (tiled area × 20 mm; 1:4). Price per bag (₹420 example).

**Paint:** area = inside faces of every room up to its ceiling (both sides of shared walls; rooms inside rooms counted once; doors/windows taken out) + inner walls (both faces) + ceilings (option) + outside of the house (option). Litres = area × coats ÷ coverage (default 12 m²/L, 2 coats), rounded up to 0.1 L. Price per litre (₹250 example).

**Will it get in?** (route button on a selected item): the thing is moved as a rectangle through a grid of positions (~40–120 mm) and 15° turns (breadth-first search) from just outside every outside door (a door with no room just outside it), or from the top of the stairs on upper floors. Obstacles: walls and window glass, door heads above the door height, inner walls in its height, optionally other furniture. It tries "as it stands", "on its side" and "lying flat" (vertical size must pass under door heads). Stairs: the narrowest side must be ≤ flight width; for L/U stairs the length must turn the landing (longest thing of width w around a corner of passages a, b: min over θ of a/sinθ + b/cosθ − w/(sinθ·cosθ)). Result: "Yes, it gets in through …", or where it gets stuck ("as far as the Hall. The way into the Bedroom is too tight"), with ghost outlines along the way.

**My things:** saved items ("templates") now keep their type and have a count; "Add to My things" works for any item. "Put all my things in this plan" places the ones not already on the floor (same name and size) along the walls with MaxRects packing (biggest first, both turns), keeping clear of door swings, stairs, stair openings, inner walls and existing furniture; vehicles only into parking, nothing into bathrooms/balconies. "Which home fits my things?" packs each home's first layout (empty rooms) and lists what doesn't fit, or "but tight" when they'd take over 55% of the free floor.

**Roommates** (`Home.people`, `Floor.zones`, `Item.owner`, `Home.meId`, `Home.originId`): people with colours; a space per person (rectangle, drag to move, corner to resize); "Belongs to" on furniture (coloured dot on the plan); "This is me" makes new things yours. Yellow warnings: someone's thing in another person's space, two people's spaces overlapping. Round trip: share links carry people, meId and the original home id; a copy keeps `originId` and forgets `meId`; opening a roommate's link offers "Bring in X's things", which replaces X's things and space on each layout/floor (matched by position) in my home.

## 19. Plug points, floor over the stairs (added later)

**Plug points** (`Floor.points`): placed on a room side like a door (side + offset), height from the floor. Kinds: switchboard (switches + plug, 4′), plug point (1′), power point 16A (1′), switches only (no power). Drawn as small plates on the inside of the wall; small plates in 3D. Things that need electricity (`power`: study table, TV unit, cooler = light; fridge, washing machine, geyser = heavy; AC = ac; any item can be set) get yellow warnings, only once the floor has at least one plug: light > 5′ from the nearest plug → "… Use a N ft/m extension cord" (6/10/15/25/50 ft or 1.5/3/5/10/15 m, distance + 1′ slack); heavy > 4′ → "add a power point, no extension cord"; AC > 5′ from any plug → "no power point on its wall". New catalog items: AC (split) at 7′ on the wall, geyser at 5′6″; wall-fixed items added from the list go flat against the nearest wall.

**Floor over the stairs** (`Floor.covers`, on the floor above): Rooms → Add floor over the stairs, drag a rectangle (clipped to the stair opening). Head room = floor-to-floor height − slab − top of the highest step under it; below 6′ → yellow (below 5′ → red) "Only … head room on the stairs under this floor", can be let be. Things standing fully on it don't get the "over the stair opening" warning. 3D: a slab over the hole. Tiles: counted on it.

## 20. Adding things in 3D, wall colours (added later)

**3D editing:** the 3D view gets an **Add** button (furniture list) that adds to the floor open in 2D (or the floor picked in 3D), at the middle of the room the camera looks at (wall-fixed things against the top wall). Tap a thing to pick it (blue glow); tap the floor to move it there (a tap = pointer moved under 8 px, so turning the view never moves things); tapping a wall shows a tip. The edit bar: turn left/right 90°, raise/lower 6″ (stacking), delete, Done. Changes go to the same plan (undo works, warnings update).

**Wall colours:** `Room.wallColor` for all its walls, `Room.sideColors[side]` for one wall (top/right/bottom/left as on the plan), `Partition.color`. 16 paint swatches + any colour. 3D: a 3 mm paint layer on the inside face of each wall piece (doors/windows stay open). 2D: a coloured line along the inside of painted walls.

## 21. Distances in 3D (added later)

- Plug distances use 3D: across = plan distance from the plug to the nearest edge of the thing; up = height between the plug (its height from the floor) and the thing's height range (0 if level); distance = √(across² + up²). Warnings and cord lengths use it and show "(… across, … up/down)". The item settings show "Nearest plug: …" when plugs are marked. 16A points: "put it high, next to the AC".
- 3D Measure: tap two points on anything (floor, walls, things, plug plates snap to their centre); orange dots and a line drawn on top; shows the 3D distance with across and up. "Space between floors" is set to 0 while measuring so heights are real.

## 22. Dragging in 3D (added later)

Pressing on a thing in 3D picks it and starts a drag: the camera controls are switched off until the finger lifts, and the finger's ray meets a flat plane at the height where the thing was grabbed, so it slides along the floor under the finger. The first move (over 6 px) makes one undo step; the frames of the drag don't. Pressing empty space still turns the view.
