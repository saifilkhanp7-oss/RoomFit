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
  };
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
