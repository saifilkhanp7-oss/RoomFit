import type { Item } from './types';
import { MM_PER_FOOT, MM_PER_INCH } from './units';

/** feet + inches → mm */
export const fi = (ft: number, inch = 0) => Math.round(ft * MM_PER_FOOT + inch * MM_PER_INCH);

export type Category = 'Beds' | 'Study' | 'Storage' | 'Living' | 'Kitchen' | 'Bathroom' | 'Other' | 'Vehicles' | 'Structure';

export interface CatalogEntry {
  type: string;
  label: string;
  category: Category;
  width: number;
  depth: number;
  heightMm?: number;
  shape: 'rect' | 'round';
  color: string;
  mount?: 'floor' | 'ceiling' | 'under';
  /** When dropped near a wall, turn its back (the "head" side) to the wall. */
  wallItem?: boolean;
  /** Open space under it (legs), e.g. a cot or a table. Things that are low enough fit underneath. */
  openBelowMm?: number;
  /** Usually fixed to the wall (can hang off the floor). */
  wallFixed?: boolean;
  /** Ceiling things: how far the bottom hangs below the ceiling. */
  dropMm?: number;
  /** Needs electricity. */
  power?: 'light' | 'heavy' | 'ac';
  /** Usual height from the floor when added (an AC high on the wall). */
  elevationMm?: number;
  /** Don't give walking-space warnings for this item (chairs sit close to tables etc). */
  noClearance?: boolean;
  multiOnly?: boolean;
}

export const CATEGORIES: Category[] = ['Beds', 'Study', 'Storage', 'Living', 'Kitchen', 'Bathroom', 'Other', 'Vehicles', 'Structure'];

export const CATALOG: CatalogEntry[] = [
  // Beds
  { type: 'bed-single', label: 'Single bed', category: 'Beds', width: fi(3), depth: fi(6, 6), heightMm: fi(1, 6), shape: 'rect', color: '#7aa7e8', wallItem: true, openBelowMm: fi(1, 2) },
  { type: 'bed-double', label: 'Double bed', category: 'Beds', width: fi(4, 6), depth: fi(6, 6), heightMm: fi(1, 8), shape: 'rect', color: '#7aa7e8', wallItem: true, openBelowMm: fi(0, 10) },
  { type: 'bed-queen', label: 'Queen bed', category: 'Beds', width: fi(5), depth: fi(6, 8), heightMm: fi(1, 8), shape: 'rect', color: '#7aa7e8', wallItem: true, openBelowMm: fi(0, 10) },
  { type: 'bed-bunk', label: 'Bunk bed', category: 'Beds', width: fi(3), depth: fi(6, 6), heightMm: fi(5, 6), shape: 'rect', color: '#5d8fd9', wallItem: true },
  // Study
  { type: 'study-table', label: 'Study table', category: 'Study', width: fi(4), depth: fi(2), heightMm: fi(2, 6), shape: 'rect', color: '#c9a27a', wallItem: true, openBelowMm: fi(2, 3), power: 'light' },
  { type: 'chair', label: 'Chair', category: 'Study', width: fi(1, 8), depth: fi(1, 8), heightMm: fi(3), shape: 'rect', color: '#a7835e', noClearance: true, openBelowMm: fi(1, 4) },
  { type: 'bookshelf', label: 'Bookshelf', category: 'Study', width: fi(2, 6), depth: fi(1), heightMm: fi(5), shape: 'rect', color: '#b58b62', wallItem: true },
  // Storage
  { type: 'cupboard', label: 'Cupboard', category: 'Storage', width: fi(3), depth: fi(2), heightMm: fi(6, 6), shape: 'rect', color: '#9c8b7a', wallItem: true },
  { type: 'shelf', label: 'Shelf', category: 'Storage', width: fi(2), depth: fi(1), heightMm: fi(4), shape: 'rect', color: '#b39a80', wallItem: true, wallFixed: true },
  { type: 'shoe-rack', label: 'Shoe rack', category: 'Storage', width: fi(2), depth: fi(1), heightMm: fi(3), shape: 'rect', color: '#8f7d6c', wallItem: true },
  { type: 'drawers', label: 'Chest of drawers', category: 'Storage', width: fi(2, 6), depth: fi(1, 6), heightMm: fi(3), shape: 'rect', color: '#a38b73', wallItem: true },
  { type: 'suitcase', label: 'Suitcase', category: 'Storage', width: fi(1, 6), depth: fi(0, 10), heightMm: fi(2, 2), shape: 'rect', color: '#5d6b7a', noClearance: true },
  { type: 'box', label: 'Box / carton', category: 'Storage', width: fi(1, 6), depth: fi(1, 2), heightMm: fi(1, 2), shape: 'rect', color: '#c8a576', noClearance: true },
  { type: 'stool', label: 'Stool', category: 'Storage', width: fi(1, 2), depth: fi(1), heightMm: fi(0, 10), shape: 'rect', color: '#8a9096', noClearance: true },
  // Living
  { type: 'sofa', label: 'Sofa', category: 'Living', width: fi(5), depth: fi(2, 9), heightMm: fi(2, 9), shape: 'rect', color: '#8fb98b', wallItem: true },
  { type: 'bean-bag', label: 'Bean bag', category: 'Living', width: fi(2, 6), depth: fi(2, 6), heightMm: fi(2), shape: 'round', color: '#e3a35c' },
  { type: 'coffee-table', label: 'Coffee table', category: 'Living', width: fi(3), depth: fi(1, 6), heightMm: fi(1, 6), shape: 'rect', color: '#c9a27a', openBelowMm: fi(1, 2) },
  { type: 'tv-unit', label: 'TV unit', category: 'Living', width: fi(4), depth: fi(1, 4), heightMm: fi(1, 8), shape: 'rect', color: '#6f6a66', wallItem: true, openBelowMm: 0, power: 'light' },
  // Kitchen / dining
  { type: 'fridge', label: 'Fridge', category: 'Kitchen', width: fi(2), depth: fi(2, 2), heightMm: fi(5, 6), shape: 'rect', color: '#b9c4cf', wallItem: true, power: 'heavy' },
  { type: 'dining-table', label: 'Dining table', category: 'Kitchen', width: fi(4), depth: fi(2, 6), heightMm: fi(2, 6), shape: 'rect', color: '#c9a27a', openBelowMm: fi(2, 3) },
  { type: 'stove', label: 'Stove counter', category: 'Kitchen', width: fi(4), depth: fi(2), heightMm: fi(2, 10), shape: 'rect', color: '#9aa3ab', wallItem: true },
  // Bathroom
  { type: 'toilet', label: 'Toilet (WC)', category: 'Bathroom', width: fi(1, 3), depth: fi(2, 3), heightMm: fi(2, 7), shape: 'rect', color: '#e8eef2', wallItem: true, noClearance: true },
  { type: 'basin', label: 'Wash basin', category: 'Bathroom', width: fi(1, 8), depth: fi(1, 4), heightMm: fi(2, 10), shape: 'rect', color: '#e8eef2', wallItem: true, noClearance: true, openBelowMm: fi(2) },
  { type: 'shower', label: 'Shower area', category: 'Bathroom', width: fi(3), depth: fi(3), shape: 'rect', color: '#b9dcef', mount: 'under', noClearance: true },
  { type: 'geyser', label: 'Geyser', category: 'Bathroom', width: fi(1, 4), depth: fi(1, 2), heightMm: fi(1, 8), shape: 'rect', color: '#eef1f3', wallItem: true, wallFixed: true, noClearance: true, power: 'heavy', elevationMm: fi(5, 6) },
  { type: 'washing-machine', label: 'Washing machine', category: 'Bathroom', width: fi(2), depth: fi(2), heightMm: fi(2, 10), shape: 'rect', color: '#d5dbe0', wallItem: true, power: 'heavy' },
  // Other
  { type: 'cooler', label: 'Cooler', category: 'Other', width: fi(1, 6), depth: fi(1, 6), heightMm: fi(4), shape: 'rect', color: '#9fc7d6', power: 'light' },
  { type: 'mirror', label: 'Mirror', category: 'Other', width: fi(2), depth: fi(0, 4), heightMm: fi(5), shape: 'rect', color: '#bfe0f2', wallItem: true, noClearance: true, wallFixed: true },
  { type: 'dustbin', label: 'Dustbin', category: 'Other', width: fi(1), depth: fi(1), heightMm: fi(1, 6), shape: 'round', color: '#7d8a8f', noClearance: true },
  { type: 'fan', label: 'Ceiling fan', category: 'Other', width: fi(4), depth: fi(4), shape: 'round', color: '#9aa0a6', mount: 'ceiling', noClearance: true },
  { type: 'ac', label: 'AC (split)', category: 'Other', width: fi(3, 2), depth: fi(0, 9), heightMm: fi(1), shape: 'rect', color: '#e6edf2', wallItem: true, wallFixed: true, noClearance: true, power: 'ac', elevationMm: fi(7) },
  { type: 'lamp', label: 'Hanging lamp', category: 'Other', width: fi(1, 4), depth: fi(1, 4), shape: 'round', color: '#f2c94c', mount: 'ceiling', noClearance: true, dropMm: fi(2) },
  { type: 'rug', label: 'Rug', category: 'Other', width: fi(5), depth: fi(3), shape: 'rect', color: '#d9b8c4', mount: 'under', noClearance: true },
  // Vehicles (top view, front of the vehicle = top edge)
  { type: 'car-hatch', label: 'Car (hatchback)', category: 'Vehicles', width: 1700, depth: 3800, heightMm: 1520, shape: 'rect', color: '#d98080' },
  { type: 'car-sedan', label: 'Car (sedan)', category: 'Vehicles', width: 1750, depth: 4500, heightMm: 1480, shape: 'rect', color: '#7aa7e8' },
  { type: 'car-suv', label: 'Car (SUV)', category: 'Vehicles', width: 1850, depth: 4600, heightMm: 1780, shape: 'rect', color: '#8f9aa5' },
  { type: 'motorbike', label: 'Motorbike', category: 'Vehicles', width: 800, depth: 2100, heightMm: 1150, shape: 'rect', color: '#4b5563', noClearance: true },
  { type: 'scooter', label: 'Scooter', category: 'Vehicles', width: 700, depth: 1850, heightMm: 1150, shape: 'rect', color: '#e3a35c', noClearance: true },
  { type: 'bicycle', label: 'Bicycle', category: 'Vehicles', width: 600, depth: 1750, heightMm: 1050, shape: 'rect', color: '#8fb98b', noClearance: true },
  // Structure
  { type: 'stairs', label: 'Stairs', category: 'Structure', width: fi(3, 6), depth: fi(10), shape: 'rect', color: '#c2b8a3', multiOnly: true, noClearance: true },
  { type: 'pillar', label: 'Pillar', category: 'Structure', width: fi(1), depth: fi(1), heightMm: fi(10), shape: 'rect', color: '#8a8f96', noClearance: true },
  { type: 'bathroom', label: 'Bathroom block', category: 'Structure', width: fi(5), depth: fi(7), heightMm: fi(7), shape: 'rect', color: '#a9c3c9' },
];

export const CUSTOM_COLOR = '#b48ad6';

export const COLOR_SWATCHES = [
  '#7aa7e8', '#5d8fd9', '#8fb98b', '#e3a35c', '#c9a27a', '#9c8b7a',
  '#d98080', '#b48ad6', '#e3c35c', '#9fc7d6', '#7d8a8f', '#d9b8c4',
];

export function catalogEntry(type: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.type === type);
}

export function itemMount(item: Item): 'floor' | 'ceiling' | 'under' {
  return item.mount ?? catalogEntry(item.type)?.mount ?? 'floor';
}

export function isStairs(item: Item) {
  return item.type === 'stairs';
}

/** Height used for 3D and height checks: what the user typed, else the catalog default. */
export function itemHeight(item: Item): number | undefined {
  return item.heightMm ?? catalogEntry(item.type)?.heightMm;
}

/** Height to use for stacking when nothing is known (a typical table/box). */
export const DEFAULT_ITEM_HEIGHT = 750;

export const itemElevation = (item: Item) => Math.max(0, item.elevationMm ?? 0);

/** Open space under the item (0 = closed down to the floor). */
export function itemOpenBelow(item: Item): number {
  const h = itemHeight(item) ?? DEFAULT_ITEM_HEIGHT;
  return Math.max(0, Math.min(h - 20, item.openBelowMm ?? catalogEntry(item.type)?.openBelowMm ?? 0));
}

/** Bottom and top of the item, from the floor. */
export function itemSpan(item: Item): { bottom: number; top: number; solidBottom: number } {
  const bottom = itemElevation(item);
  const h = itemHeight(item) ?? DEFAULT_ITEM_HEIGHT;
  return { bottom, top: bottom + h, solidBottom: bottom + itemOpenBelow(item) };
}

/** How far a ceiling thing (fan, lamp) hangs below the ceiling. */
export function itemDrop(item: Item): number {
  return catalogEntry(item.type)?.dropMm ?? 305;
}

/** What electricity it needs: from the item, else the catalog. */
export function itemPower(item: Item): 'none' | 'light' | 'heavy' | 'ac' {
  if (item.power) return item.power;
  return catalogEntry(item.type)?.power ?? 'none';
}

export function isWallFixed(item: Item): boolean {
  return item.wallMounted ?? catalogEntry(item.type)?.wallFixed ?? false;
}
