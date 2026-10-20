// All lengths are in millimetres (integers). Angles in degrees.
// Floor coordinates: origin top-left, x to the right, y down.

export type Unit = 'ft' | 'm';
export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface AppData {
  schemaVersion: number;
  homes: Home[];
  customItemTemplates: ItemTemplate[];
  /** When "My items" last changed (for cloud sync). */
  templatesUpdatedAt?: number;
  settings: Settings;
  lastOpened?: { homeId: string; layoutId: string; floorId: string; at: number };
}

export interface Home {
  id: string;
  name: string;
  kind: 'single' | 'multi';
  layouts: Layout[];
  createdAt: number;
  updatedAt: number;
  /** Roommates sharing this home (each with a colour). */
  people?: Person[];
  /** Which person "I" am in this copy (set by a roommate in their copy). */
  meId?: string;
  /** The home this one was copied from (to bring a roommate's things back). */
  originId?: string;
}

export interface Person {
  id: string;
  name: string;
  color: string;
}

/** A person's own space in a shared room. */
export interface Zone {
  id: string;
  personId: string;
  x: number;
  y: number;
  width: number;
  length: number;
}

/** A wall inside a room: anywhere, any angle, and any height range (half wall, wall above a cupboard...). */
export interface Partition {
  id: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  thicknessMm: number;
  /** Height of its bottom above the floor (0 = stands on the floor). */
  bottomMm: number;
  /** Height of its top above the floor; not set = up to the ceiling. */
  topMm?: number;
}

export interface LayoutView {
  floorId: string;
  zoom: number; // screen pixels per mm
  panX: number; // screen px
  panY: number;
}

export interface Layout {
  id: string;
  name: string;
  floors: Floor[]; // bottom -> top
  view?: LayoutView;
  /** Bricks & tiles cost settings. */
  estimate?: Estimate;
}

export interface BrickSpec {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  /** Mortar gap between two bricks. */
  jointMm: number;
  price: number;
  /** Extra for broken bricks, %. */
  wastePct: number;
}

export interface TileSpec {
  lengthMm: number;
  widthMm: number;
  /** Gap between tiles (grout). */
  gapMm: number;
  price: number;
}

export interface Estimate {
  currency: string;
  brick: BrickSpec;
  walls: boolean;
  stairs: boolean;
  ceiling: boolean;
  ceilingMm: number;
  tile: TileSpec;
  /** Extra tiles for cutting and breakage, %. */
  tileWastePct: number;
  /** Rooms with their own tile, or no tiles. Others use `tile`. */
  rooms: Record<string, { mode: 'own' | 'none'; tile?: TileSpec }>;
  paint: PaintSpec;
  cement: CementSpec;
}

export interface PaintSpec {
  coats: number;
  /** m² one litre covers in one coat. */
  coverageM2: number;
  /** Price of one litre. */
  price: number;
  ceiling: boolean;
  outside: boolean;
}

export interface CementSpec {
  /** Price of one 50 kg bag. */
  price: number;
  /** Brick mortar mix, cement : sand = 1 : mortarMix. */
  mortarMix: number;
  plaster: boolean;
  plasterMix: number;
  plasterMm: number;
  plasterOutside: boolean;
  tileBed: boolean;
  tileBedMm: number;
  tileBedMix: number;
}

export interface Floor {
  id: string;
  name: string;
  outerWallMm: number;
  /** Default thickness for walls between rooms (used when attaching/snapping rooms). */
  innerWallMm?: number;
  rooms: Room[];
  sharedWalls: SharedWall[];
  openings: Opening[];
  items: Item[];
  /** Warnings the user chose to "let it be". */
  okWarnings?: string[];
  /** Floor-to-floor height (to the floor above). Default: highest ceiling + slab. */
  floorHeightMm?: number;
  /** Walls inside rooms. */
  partitions?: Partition[];
  /** Roommates' own spaces. */
  zones?: Zone[];
}

export type RoomKind = 'room' | 'hall' | 'bathroom' | 'kitchen' | 'balcony' | 'parking' | 'store';

export interface Room {
  id: string;
  name: string;
  /** What kind of space this is (default: room). A room can sit inside another one, e.g. rooms inside a Hall. */
  kind?: RoomKind;
  x: number; // inner top-left
  y: number;
  width: number; // inner size
  length: number;
  ceilingMm?: number;
}

export interface SharedWall {
  id: string;
  roomA: string;
  roomB: string;
  side: Side;
  thicknessMm: number;
}

export interface Opening {
  id: string;
  kind: 'door' | 'window';
  roomId: string;
  side: Side;
  offsetMm: number;
  widthMm: number;
  doorType?: 'swing' | 'double' | 'sliding' | 'shutter' | 'opening';
  hinge?: 'start' | 'end';
  opensInto?: 'this' | 'other';
  sillMm?: number;
  heightMm?: number;
}

export interface Item {
  id: string;
  type: string;
  label: string;
  x: number; // centre
  y: number;
  width: number;
  depth: number;
  rotation: number;
  shape: 'rect' | 'round';
  color: string;
  heightMm?: number;
  /** Height of the item's bottom from the floor (e.g. a suitcase on top of a cupboard). 0 = on the floor. */
  elevationMm?: number;
  /** Height of the open space underneath (bed or table on legs). 0 = closed down to the floor. */
  openBelowMm?: number;
  /** Fixed to the wall (shelf, mirror, TV): allowed to be off the floor with nothing under it. */
  wallMounted?: boolean;
  mount?: 'floor' | 'ceiling' | 'under';
  locked?: boolean;
  stairs?: {
    style: 'straight' | 'L' | 'U';
    flightWidthMm: number;
    turn: 'left' | 'right';
    upDir: 0 | 90 | 180 | 270;
    /** Open underneath: the space under the stairs can be used (storage, a desk...). */
    open?: boolean;
  };
  /** Whose it is (roommate id); not set = shared. */
  owner?: string;
}

export interface ItemTemplate {
  // Saved custom items ("My items")
  id: string;
  type: string;
  label: string;
  width: number;
  depth: number;
  heightMm?: number;
  shape: 'rect' | 'round';
  color: string;
  /** How many of it you have (My things). */
  count?: number;
}

export interface Settings {
  unit: Unit;
  theme: 'light' | 'dark' | 'system';
  minWalkMm: number;
  fanClearanceMm: number;
  snap: boolean;
  showGrid: boolean;
  showDims: boolean;
  lastBackupAt?: number;
  iosReminderDismissedAt?: number;
}
