import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ArrowDown, ArrowLeft, ArrowUp, Box as BoxIcon, Eye, Plus, RotateCcw, RotateCw, Scissors, Trash2 } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { FurniturePanel, type Pickable } from '../editor/panels/FurniturePanel';
import { formatLength } from '../model/units';
import { id as newItemId } from '../model/defaults';
import type { Pt } from '../geometry/poly';
import type { Floor, Item, ItemTemplate, Unit } from '../model/types';
import { itemDrop, itemElevation, itemHeight, itemMount, itemOpenBelow, isStairs } from '../model/catalog';
import { computeWarnings, roomOfPoint, stairOpenings, type WarningOptions, type WarningResult } from '../geometry/warnings';
import { clipToRect, floorHeight, floorLevels, groundIndex, roomCeiling, SLAB } from '../geometry/levels';
import { stairBlocks } from '../geometry/stairs';
import { buildWalls, wallColorOf } from '../geometry/wallPieces';
import { kindInfo, pointPos } from '../geometry/power';
import { partitionAngle, partitionLength, partitionMid, partitionSpan } from '../geometry/partitions';
import { roomOuterBox } from '../geometry/walls';
import { byDepth, depthOf, kindOf } from '../geometry/spaces';
import { floorBounds } from '../geometry/view';
import { WarningsPanel } from '../editor/panels/WarningsPanel';
import { useResolvedTheme } from '../hooks/useTheme';
import './View3D.css';

const M = 1 / 1000; // mm → metres
const DEFAULT_CEILING_3D = 3048;

interface Props {
  floors: Floor[];
  /** Floor open in the 2D plan. */
  startIndex: number;
  multi: boolean;
  homeName: string;
  layoutName: string;
  unit: Unit;
  settings: WarningOptions['settings'];
  onClose: () => void;
  /** Editing in 3D (left out = look only). */
  templates?: ItemTemplate[];
  onAddItem?: (floorIndex: number, item: Item) => void;
  onUpdateItem?: (floorIndex: number, id: string, patch: Partial<Item>) => void;
  onDeleteItem?: (floorIndex: number, id: string) => void;
}

const ceilingOf = roomCeiling;

/** Wall pieces (mm) → three.js boxes (m). */
function walls3d(floor: Floor, cut: boolean) {
  const rooms = new Map(floor.rooms.map((r) => [r.id, r]));
  return buildWalls(floor, cut).map((w) => {
    const r = w.roomId ? rooms.get(w.roomId) : undefined;
    const color = r && w.side ? wallColorOf(r, w.side) : undefined;
    const p = color && w.paint;
    return {
      key: w.key,
      glass: w.glass,
      pos: [((w.x0 + w.x1) / 2) * M, ((w.z0 + w.z1) / 2) * M, ((w.y0 + w.y1) / 2) * M] as [number, number, number],
      size: [(w.x1 - w.x0) * M, (w.z1 - w.z0) * M, (w.y1 - w.y0) * M] as [number, number, number],
      paint: p
        ? {
            color: color!,
            pos: [((p.x0 + p.x1) / 2) * M, ((w.z0 + w.z1) / 2) * M, ((p.y0 + p.y1) / 2) * M] as [number, number, number],
            size: [(p.x1 - p.x0) * M, (w.z1 - w.z0) * M, (p.y1 - p.y0) * M] as [number, number, number],
          }
        : undefined,
    };
  });
}

const FLOOR_3D: Record<string, [string, string]> = {
  room: ['#f4ede2', '#3a3f48'],
  hall: ['#ece3d3', '#3f3b33'],
  bathroom: ['#d6e9f5', '#2f4250'],
  kitchen: ['#efeadb', '#3c3a31'],
  balcony: ['#dcebd5', '#33443a'],
  parking: ['#c9ccd1', '#2f3237'],
  store: ['#ebe5dc', '#38353a'],
};

/** Real steps, rising to the floor above (or the ceiling on the top floor). */
function StairsMesh({ it, rise, state }: { it: Item; rise: number; state: 'red' | 'yellow' | 'selected' | null }) {
  const blocks = useMemo(() => stairBlocks(it, rise), [it, rise]);
  const emissive = state === 'selected' ? '#1d4ed8' : state === 'red' ? '#7a0000' : state === 'yellow' ? '#6b4e00' : '#000000';
  return (
    <group position={[it.x * M, 0, it.y * M]} rotation={[0, (-it.rotation * Math.PI) / 180, 0]}>
      {blocks.map((b, i) => (
        <mesh key={i} position={[((b.x0 + b.x1) / 2) * M, ((b.top + b.bottom) / 2) * M, ((b.y0 + b.y1) / 2) * M]}>
          <boxGeometry args={[(b.x1 - b.x0) * M, (b.top - b.bottom) * M, (b.y1 - b.y0) * M]} />
          <meshStandardMaterial color={i % 2 ? it.color : shadeHex(it.color, -0.08)} emissive={emissive} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function shadeHex(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return '#' + c.getHexString();
}

function ItemMesh({ it, floor, state, rise }: { it: Item; floor: Floor; state: 'red' | 'yellow' | 'selected' | null; rise: number }) {
  const room = roomOfPoint(floor, it);
  const ceiling = room ? ceilingOf(floor, room) : DEFAULT_CEILING_3D;
  if (isStairs(it)) return <StairsMesh it={it} rise={rise} state={state} />;
  const mount = itemMount(it);
  let h = itemHeight(it) ?? 750;
  let y0 = mount === 'floor' ? itemElevation(it) : 0;
  const open = mount === 'floor' && !isStairs(it) && it.shape === 'rect' && it.type !== 'bed-bunk' ? itemOpenBelow(it) : 0;
  if (mount === 'under') h = 12;
  if (mount === 'ceiling') {
    y0 = (it.heightMm ?? ceiling - itemDrop(it)) - 40;
    h = 40;
  }
  const color = state === 'red' ? '#ff4d4d' : it.color;
  const emissive = state === 'selected' ? '#1d4ed8' : state === 'red' ? '#7a0000' : state === 'yellow' ? '#6b4e00' : '#000000';
  const rotY = (-it.rotation * Math.PI) / 180;
  const pos: [number, number, number] = [it.x * M, (y0 + h / 2) * M, it.y * M];

  if (mount === 'ceiling' && it.type !== 'fan') {
    // hanging lamp: a shade on a cord
    const r = (Math.min(it.width, it.depth) / 2) * 0.8;
    return (
      <group position={[it.x * M, 0, it.y * M]}>
        <mesh position={[0, (y0 + r * 0.6) * M, 0]}>
          <sphereGeometry args={[r * M, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={color} emissive={state ? emissive : '#7a5a00'} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, ((y0 + ceiling) / 2) * M, 0]}>
          <cylinderGeometry args={[0.006, 0.006, Math.max(0.01, (ceiling - y0) * M), 6]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      </group>
    );
  }
  if (mount === 'ceiling') {
    return (
      <group position={[it.x * M, 0, it.y * M]} rotation={[0, rotY, 0]}>
        <mesh position={[0, (y0 + h / 2) * M, 0]}>
          <cylinderGeometry args={[it.width * 0.5 * M, it.width * 0.5 * M, h * M, 24]} />
          <meshStandardMaterial color={color} emissive={emissive} transparent opacity={0.55} />
        </mesh>
        <mesh position={[0, ((y0 + ceiling) / 2) * M, 0]}>
          <cylinderGeometry args={[0.012, 0.012, Math.max(0.01, (ceiling - y0) * M), 8]} />
          <meshStandardMaterial color="#777" />
        </mesh>
      </group>
    );
  }
  if (it.shape === 'round') {
    return (
      <mesh position={pos} rotation={[0, rotY, 0]} scale={[1, 1, it.depth / it.width]}>
        <cylinderGeometry args={[(it.width / 2) * M, (it.width / 2) * M, h * M, 28]} />
        <meshStandardMaterial color={color} emissive={emissive} roughness={0.8} />
      </mesh>
    );
  }
  if (it.type === 'bed-bunk') {
    // two mattresses on posts
    const lower = 450;
    const upper = Math.max(lower + 400, h - 250);
    return (
      <group position={[it.x * M, y0 * M, it.y * M]} rotation={[0, rotY, 0]}>
        {[lower, upper].map((yy) => (
          <mesh key={yy} position={[0, (yy - 100) * M, 0]}>
            <boxGeometry args={[it.width * M, 200 * M, it.depth * M]} />
            <meshStandardMaterial color={color} emissive={emissive} roughness={0.85} />
          </mesh>
        ))}
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[(sx * (it.width / 2 - 25)) * M, (h / 2) * M, (sz * (it.depth / 2 - 25)) * M]}>
              <boxGeometry args={[50 * M, h * M, 50 * M]} />
              <meshStandardMaterial color="#6b7280" emissive={emissive} />
            </mesh>
          )),
        )}
      </group>
    );
  }
  if (open > 0) {
    // open underneath: a top part on four legs (cot, table, chair)
    const leg = Math.max(30, Math.min(60, Math.min(it.width, it.depth) * 0.06));
    const topH = h - open;
    return (
      <group position={[it.x * M, y0 * M, it.y * M]} rotation={[0, rotY, 0]}>
        <mesh position={[0, (open + topH / 2) * M, 0]}>
          <boxGeometry args={[it.width * M, topH * M, it.depth * M]} />
          <meshStandardMaterial color={color} emissive={emissive} roughness={0.8} />
        </mesh>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[(sx * (it.width / 2 - leg / 2)) * M, (open / 2) * M, (sz * (it.depth / 2 - leg / 2)) * M]}>
              <boxGeometry args={[leg * M, open * M, leg * M]} />
              <meshStandardMaterial color="#8b9097" emissive={emissive} />
            </mesh>
          )),
        )}
      </group>
    );
  }
  return (
    <mesh position={pos} rotation={[0, rotY, 0]}>
      <boxGeometry args={[it.width * M, h * M, it.depth * M]} />
      <meshStandardMaterial color={color} emissive={emissive} roughness={0.8} transparent={isStairs(it)} opacity={isStairs(it) ? 0.6 : 1} />
    </mesh>
  );
}

/** Orbit controls: one finger rotates, pinch zooms, two fingers pan. Renders only on change. */
function Controls({ target, preset }: { target: THREE.Vector3; preset: { pos: THREE.Vector3; n: number } }) {
  const { camera, gl, invalidate } = useThree();
  const ref = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.copy(target);
    c.maxPolarAngle = Math.PI / 2 - 0.05;
    c.minDistance = 0.5;
    c.maxDistance = 60;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.addEventListener('change', () => invalidate());
    c.update();
    ref.current = c;
    return () => c.dispose();
  }, [camera, gl, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    camera.position.copy(preset.pos);
    c.target.copy(target);
    c.update();
    invalidate();
  }, [preset.n]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** A flat shape in plan coordinates (mm) with holes, as geometry lying on the floor (or extruded down as a slab). */
function shapeOf(outer: Pt[], holes: Pt[][]): THREE.Shape {
  // the mesh is turned flat with rotation x = -90°, so plan y becomes -shape y
  const toV = (p: Pt) => new THREE.Vector2(p.x * M, -p.y * M);
  const sh = new THREE.Shape(outer.map(toV));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(toV)));
  return sh;
}
const rectPts = (b: { minX: number; minY: number; maxX: number; maxY: number }): Pt[] => [
  { x: b.minX, y: b.minY },
  { x: b.maxX, y: b.minY },
  { x: b.maxX, y: b.maxY },
  { x: b.minX, y: b.maxY },
];
const area = (p: Pt[]) => Math.abs(p.reduce((s, q, i) => s + q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y, 0)) / 2;
/** Stair holes that fall inside a box, clipped to it (a hole must be inside its outline). */
function holesIn(holes: Pt[][], b: { minX: number; minY: number; maxX: number; maxY: number }): Pt[][] {
  const inner = { minX: b.minX + 2, minY: b.minY + 2, maxX: b.maxX - 2, maxY: b.maxY - 2 };
  return holes.map((h) => clipToRect(h, inner)).filter((h) => h.length >= 3 && area(h) > 100);
}

/** One storey: floor surfaces (with stair holes), slab, walls and furniture. */
type Tap = ThreeEvent<MouseEvent>;
/** A real tap, not the end of turning the view. */
const isTap = (e: Tap) => e.delta < 8;

function Storey({ floor, below, warnings, cut, slab, rise, dark, holeShade, selectedId, onFloorTap, onItemTap, onWallTap }: {
  onWallTap?: () => void;
  selectedId?: string;
  onFloorTap?: (p: Pt) => void;
  onItemTap?: (id: string) => void;
  floor: Floor;
  below?: Floor;
  warnings: WarningResult;
  cut: boolean;
  slab: boolean;
  rise: number | null;
  dark: boolean;
  holeShade: boolean;
}) {
  const holes = useMemo(() => stairOpenings(below).map((so) => so.poly), [below]);
  const surfaces = useMemo(
    () =>
      byDepth(floor).map(({ room: r, depth }) => {
        const b = { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.length };
        return { r, depth, geo: new THREE.ShapeGeometry(shapeOf(rectPts(b), holesIn(holes, b))) };
      }),
    [floor, holes],
  );
  const slabs = useMemo(
    () =>
      slab
        ? floor.rooms
            .filter((r) => depthOf(floor, r) === 0)
            .map((r) => {
              const b = roomOuterBox(floor, r);
              return { id: r.id, geo: new THREE.ExtrudeGeometry(shapeOf(rectPts(b), holesIn(holes, b)), { depth: SLAB * M, bevelEnabled: false }) };
            })
        : [],
    [floor, holes, slab],
  );
  const holeGeos = useMemo(() => (holeShade ? holes.map((h) => new THREE.ShapeGeometry(shapeOf(h, []))) : []), [holes, holeShade]);
  const walls = useMemo(() => walls3d(floor, cut), [floor, cut]);
  useEffect(() => () => [...surfaces.map((s) => s.geo), ...slabs.map((s) => s.geo), ...holeGeos].forEach((g) => g.dispose()), [surfaces, slabs, holeGeos]);
  const wallTap = (e: Tap) => {
    e.stopPropagation();
    if (onWallTap && isTap(e)) onWallTap();
  };
  const floorTap = (e: Tap) => {
    e.stopPropagation();
    if (onFloorTap && isTap(e)) onFloorTap({ x: e.point.x / M, y: e.point.z / M });
  };

  return (
    <>
      {slabs.map((s) => (
        <mesh key={s.id} geometry={s.geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -SLAB * M - 0.0005, 0]}>
          <meshStandardMaterial color={dark ? '#5b616b' : '#cfd3d9'} roughness={0.95} />
        </mesh>
      ))}
      {holeGeos.map((g, i) => (
        <mesh key={i} geometry={g} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, 0]}>
          <meshStandardMaterial color={dark ? '#0d0f12' : '#3b4048'} />
        </mesh>
      ))}
      {surfaces.map(({ r, depth, geo }) => (
        <mesh key={r.id} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001 + depth * 0.002, 0]} onClick={floorTap}>
          <meshStandardMaterial color={(FLOOR_3D[kindOf(r)] ?? FLOOR_3D.room)[dark ? 1 : 0]} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {walls.map((w) => (
        <mesh key={w.key} position={w.pos} onClick={wallTap}>
          <boxGeometry args={w.size} />
          {w.glass ? <meshStandardMaterial color="#8ec5ff" transparent opacity={0.35} /> : <meshStandardMaterial color={dark ? '#c9ced6' : '#fafafa'} roughness={0.95} />}
        </mesh>
      ))}
      {walls.map(
        (w) =>
          w.paint && (
            <mesh key={w.key + 'p'} position={w.paint.pos}>
              <boxGeometry args={w.paint.size} />
              <meshStandardMaterial color={w.paint.color} roughness={0.9} />
            </mesh>
          ),
      )}
      {(floor.covers ?? []).map((cv) => (
        <mesh key={cv.id} position={[(cv.x + cv.width / 2) * M, (-SLAB / 2 + 2) * M, (cv.y + cv.length / 2) * M]} onClick={floorTap}>
          <boxGeometry args={[cv.width * M, SLAB * M, cv.length * M]} />
          <meshStandardMaterial color={(FLOOR_3D.room ?? ['#f4ede2', '#3a3f48'])[dark ? 1 : 0]} roughness={0.9} />
        </mesh>
      ))}
      {(floor.points ?? []).map((pp) => {
        const g = pointPos(floor, pp);
        if (!g) return null;
        const info = kindInfo(pp.kind);
        const w = pp.kind === 'board' || pp.kind === 'switch' ? 220 : 120;
        const h = pp.heightMm ?? info.heightMm;
        const horiz = g.along.x !== 0;
        return (
          <mesh key={pp.id} position={[(g.pos.x + g.inward.x * 8) * M, h * M, (g.pos.y + g.inward.y * 8) * M]}>
            <boxGeometry args={[(horiz ? w : 16) * M, 120 * M, (horiz ? 16 : w) * M]} />
            <meshStandardMaterial color={pp.kind === 'power' ? '#ffd8a8' : '#ffffff'} />
          </mesh>
        );
      })}
      {(floor.partitions ?? []).map((pw) => {
        const { bottom, top } = partitionSpan(floor, pw);
        const len = partitionLength(pw);
        const m = partitionMid(pw);
        const h = cut && pw.bottomMm <= 0 ? Math.min(top, 1000) - bottom : top - bottom;
        if (h <= 1 || len < 1) return null;
        return (
          <mesh key={pw.id} position={[m.x * M, (bottom + h / 2) * M, m.y * M]} rotation={[0, -partitionAngle(pw), 0]} onClick={wallTap}>
            <boxGeometry args={[len * M, h * M, pw.thicknessMm * M]} />
            <meshStandardMaterial color={pw.color ?? (dark ? '#b9bec6' : '#f2f2f2')} roughness={0.95} />
          </mesh>
        );
      })}
      {floor.items.map((it) => {
        const room = roomOfPoint(floor, it);
        return (
          <group
            key={it.id}
            onClick={(e: Tap) => {
              e.stopPropagation();
              if (onItemTap && isTap(e)) onItemTap(it.id);
            }}
          >
            <ItemMesh
              it={it}
              floor={floor}
              rise={rise ?? (room ? ceilingOf(floor, room) : DEFAULT_CEILING_3D)}
              state={it.id === selectedId ? 'selected' : warnings.red.has(it.id) ? 'red' : warnings.yellow.has(it.id) ? 'yellow' : null}
            />
          </group>
        );
      })}
    </>
  );
}

export default function View3D({ floors, startIndex, multi, homeName, layoutName, unit, settings, onClose, templates = [], onAddItem, onUpdateItem, onDeleteItem }: Props) {
  const editable = !!(onAddItem && onUpdateItem && onDeleteItem);
  const [sel, setSel] = useState<{ fi: number; id: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const selItem = sel ? floors[sel.fi]?.items.find((i) => i.id === sel.id) : undefined;
  useEffect(() => {
    if (sel && !selItem) setSel(null);
  }, [sel, selItem]);
  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 3500);
    return () => clearTimeout(t);
  }, [tip]);
  const theme = useResolvedTheme();
  const [cut, setCut] = useState(false);
  const [lost, setLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [showWarn, setShowWarn] = useState(false);
  const [show, setShow] = useState<number | 'all'>(multi && floors.length > 1 ? 'all' : Math.min(startIndex, floors.length - 1));
  const [gap, setGap] = useState(0);
  const all = show === 'all';
  const addTo = all ? Math.min(Math.max(startIndex, 0), floors.length - 1) : (show as number);

  const addPick = (pk: Pickable) => {
    if (!onAddItem) return;
    const f = floors[addTo];
    const src =
      pk.kind === 'catalog'
        ? { type: pk.entry.type, label: pk.entry.label, width: pk.entry.width, depth: pk.entry.depth, shape: pk.entry.shape, color: pk.entry.color, mount: pk.entry.mount, heightMm: undefined as number | undefined, elevationMm: pk.entry.elevationMm, wallFixed: pk.entry.wallFixed }
        : { type: pk.t.type || 'custom', label: pk.t.label, width: pk.t.width, depth: pk.t.depth, shape: pk.t.shape, color: pk.t.color, mount: undefined, heightMm: pk.t.heightMm, elevationMm: undefined, wallFixed: false };
    // the room the camera looks at, else the first room
    const look = { x: target.x / M, y: target.z / M };
    const room = roomOfPoint(f, look) ?? f.rooms[0];
    let x = room ? room.x + room.width / 2 : look.x;
    let y = room ? room.y + room.length / 2 : look.y;
    let rotation = 0;
    if (room && src.wallFixed) {
      y = room.y + src.depth / 2; // against the top wall, facing in
      rotation = 0;
    }
    const item: Item = {
      id: newItemId(),
      type: src.type,
      label: src.label,
      x: Math.round(x),
      y: Math.round(y),
      width: src.width,
      depth: src.depth,
      rotation,
      shape: src.shape,
      color: src.color,
      ...(src.mount ? { mount: src.mount } : {}),
      ...(src.heightMm ? { heightMm: src.heightMm } : {}),
      ...(src.elevationMm ? { elevationMm: src.elevationMm } : {}),
      ...(src.type === 'stairs' ? { stairs: { style: 'straight' as const, flightWidthMm: 914, turn: 'right' as const, upDir: 0 as const } } : {}),
    };
    void x;
    onAddItem(addTo, item);
    setSel({ fi: addTo, id: item.id });
    setAdding(false);
    setTip(`${item.label} added. Tap the floor to put it there (Top view is easiest).`);
  };
  const moveTo = (fi: number, p: { x: number; y: number }) => {
    if (!sel || !onUpdateItem) return;
    if (fi !== sel.fi) return setTip(`It's on ${floors[sel.fi].name}. Tap that floor.`);
    onUpdateItem(sel.fi, sel.id, { x: Math.round(p.x), y: Math.round(p.y) });
  };

  const levels = useMemo(() => floorLevels(floors), [floors]);
  const g = groundIndex(floors);
  const shown = all ? floors.map((_, i) => i) : [show as number];
  const yOf = (i: number) => (all ? levels[i] + (i - g) * gap : 0);
  const warningsPer = useMemo(
    () => floors.map((f, i) => computeWarnings(f, { floorBelow: floors[i - 1], settings, unit, heights: true, stairRiseMm: i < floors.length - 1 ? floorHeight(f) : undefined })),
    [floors, settings, unit],
  );

  // what the camera looks at: all the shown floors
  const bs = shown.map((i) => floorBounds(floors[i])).filter((b): b is NonNullable<typeof b> => !!b);
  const b = bs.length
    ? { minX: Math.min(...bs.map((x) => x.minX)), minY: Math.min(...bs.map((x) => x.minY)), maxX: Math.max(...bs.map((x) => x.maxX)), maxY: Math.max(...bs.map((x) => x.maxY)) }
    : { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
  const lowY = Math.min(...shown.map(yOf));
  const highY = Math.max(...shown.map((i) => yOf(i) + floorHeight(floors[i])));
  const tall = all ? (highY - lowY) * M : 0;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * M;
  const targetY = all ? ((lowY + highY) / 2) * M : 0.8;
  const target = useMemo(() => new THREE.Vector3(((b.minX + b.maxX) / 2) * M, targetY, ((b.minY + b.maxY) / 2) * M), [b.minX, b.maxX, b.minY, b.maxY, targetY]);
  const corner = () => {
    // narrow phone screens need the camera further back to fit the room sideways
    const aspect = window.innerWidth / Math.max(1, window.innerHeight - 160);
    const d = (Math.max(span, tall * 1.2) * 1.35 + 2.2) * Math.max(1, 0.95 / aspect);
    return new THREE.Vector3(target.x + d * 0.55, target.y + d * 0.75, target.z + d * 0.75);
  };
  const [preset, setPreset] = useState({ pos: corner(), n: 0 });
  const pick = (v: number | 'all') => {
    setShow(v);
    setShowWarn(false);
  };
  // new floor (or "All") → look at it from the corner
  const firstShow = useRef(true);
  useEffect(() => {
    if (firstShow.current) {
      firstShow.current = false;
      return;
    }
    setPreset((p) => ({ pos: corner(), n: p.n + 1 }));
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  const heightWarnings = shown.flatMap((i) =>
    warningsPer[i].list.filter((w) => /^(tall|window|fan):/.test(w.id)).map((w) => (multi ? { ...w, message: `${floors[i].name}: ${w.message}` } : w)),
  );
  const estimates = shown.some((i) => floors[i].items.some((it) => it.heightMm === undefined && itemMount(it) === 'floor') || floors[i].rooms.some((r) => r.ceilingMm === undefined));
  const dark = theme === 'dark';
  const underground = all && shown.some((i) => yOf(i) < 0);

  // Back button / Escape closes 3D
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="view3d">
      <header className="view3d-top">
        <button className="icon-btn" aria-label="Back to 2D plan" onClick={onClose}>
          <ArrowLeft size={22} />
        </button>
        <div className="view3d-title">
          <strong>3D view</strong>
          <span>
            {homeName} · {layoutName}
          </span>
        </div>
        <button className={`btn btn-ghost${cut ? ' on' : ''}`} aria-pressed={cut} onClick={() => setCut(!cut)}>
          <Scissors size={17} /> Cut walls
        </button>
      </header>

      {multi && floors.length > 1 && (
        <div className="view3d-floors">
          <div className="view3d-chips" role="group" aria-label="Floors to show">
            <button className="chip" aria-pressed={all} onClick={() => pick('all')}>
              All floors
            </button>
            {floors
              .map((f, i) => ({ f, i }))
              .reverse()
              .map(({ f, i }) => (
                <button key={f.id} className="chip" aria-pressed={show === i} onClick={() => pick(i)}>
                  {f.name}
                </button>
              ))}
          </div>
          {all && (
            <label className="view3d-gap">
              <span>Space between floors</span>
              <input type="range" min={0} max={3000} step={100} value={gap} aria-label="Space between floors" onChange={(e) => setGap(Number(e.target.value))} />
            </label>
          )}
        </div>
      )}

      <div className="view3d-canvas">
        {lost ? (
          <div className="view3d-lost">
            <p>The 3D view stopped (the phone may be low on memory).</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setLost(false);
                setCanvasKey((k) => k + 1);
              }}
            >
              Reload 3D
            </button>
          </div>
        ) : (
          <Canvas
            key={canvasKey}
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ position: preset.pos.toArray(), fov: 50, near: 0.05, far: 300 }}
            gl={{ antialias: true, powerPreference: 'default' }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                setLost(true);
              });
            }}
            style={{ touchAction: 'none' }}
          >
            <color attach="background" args={[dark ? '#17191d' : '#eef0f3']} />
            <hemisphereLight args={['#ffffff', dark ? '#30343b' : '#c9ced6', 1.1]} />
            <directionalLight position={[target.x + 5, target.y + 8, target.z + 3]} intensity={1.4} />
            <directionalLight position={[target.x - 4, target.y + 5, target.z - 6]} intensity={0.5} />
            <Controls target={target} preset={preset} />

            {/* ground (see-through when basements are shown) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[target.x, -0.003, target.z]}>
              <planeGeometry args={[span * 3 + 4, span * 3 + 4]} />
              <meshStandardMaterial color={dark ? '#1d2026' : '#e3e6ea'} transparent={underground} opacity={underground ? 0.25 : 1} depthWrite={!underground} />
            </mesh>
            {shown.map((i) => (
              <group key={floors[i].id} position={[0, yOf(i) * M, 0]}>
                <Storey
                  selectedId={sel?.fi === i ? sel.id : undefined}
                  onFloorTap={editable ? (p) => moveTo(i, p) : undefined}
                  onItemTap={editable ? (id) => setSel(sel?.id === id ? null : { fi: i, id }) : undefined}
                  onWallTap={sel ? () => setTip('That is a wall. Tap the floor (Top view or Cut walls makes it easy).') : undefined}
                  floor={floors[i]}
                  below={floors[i - 1]}
                  warnings={warningsPer[i]}
                  cut={cut}
                  slab={all && i !== g}
                  rise={i < floors.length - 1 ? floorHeight(floors[i]) : null}
                  dark={dark}
                  holeShade={!all}
                />
              </group>
            ))}
          </Canvas>
        )}

        {selItem && sel && editable ? (
          <div className="view3d-edit" role="toolbar" aria-label={`${selItem.label} in 3D`}>
            <div className="view3d-edit-title">
              <strong>{selItem.label}</strong>
              <span>Tap the floor to move it here · {formatLength(itemElevation(selItem), unit)} from the floor</span>
            </div>
            <div className="view3d-edit-btns">
              <button className="icon-btn" aria-label="Turn left" onClick={() => onUpdateItem!(sel.fi, sel.id, { rotation: (selItem.rotation + 270) % 360 })}>
                <RotateCcw size={19} />
              </button>
              <button className="icon-btn" aria-label="Turn right" onClick={() => onUpdateItem!(sel.fi, sel.id, { rotation: (selItem.rotation + 90) % 360 })}>
                <RotateCw size={19} />
              </button>
              <button className="icon-btn" aria-label="Raise" title="Raise 6 inches" onClick={() => onUpdateItem!(sel.fi, sel.id, { elevationMm: itemElevation(selItem) + 152 })}>
                <ArrowUp size={19} />
              </button>
              <button className="icon-btn" aria-label="Lower" title="Lower 6 inches" disabled={itemElevation(selItem) <= 0} onClick={() => onUpdateItem!(sel.fi, sel.id, { elevationMm: Math.max(0, itemElevation(selItem) - 152) })}>
                <ArrowDown size={19} />
              </button>
              <button
                className="icon-btn danger"
                aria-label="Delete"
                onClick={() => {
                  onDeleteItem!(sel.fi, sel.id);
                  setSel(null);
                }}
              >
                <Trash2 size={19} />
              </button>
              <button className="btn btn-primary" onClick={() => setSel(null)}>
                Done
              </button>
            </div>
          </div>
        ) : (
        <div className="view3d-presets">
          {editable && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={17} /> Add
            </button>
          )}
          <button className="btn" onClick={() => setPreset({ pos: new THREE.Vector3(target.x, target.y + Math.max(span, tall) * 1.6 + 2, target.z + 0.01), n: preset.n + 1 })}>
            <Eye size={17} /> Top
          </button>
          <button className="btn" onClick={() => setPreset({ pos: corner(), n: preset.n + 1 })}>
            <BoxIcon size={17} /> Corner
          </button>
          <button
            className="btn"
            onClick={() => {
              const i = all ? Math.min(Math.max(startIndex, 0), floors.length - 1) : (show as number);
              setPreset({ pos: new THREE.Vector3(target.x, yOf(i) * M + 1.6, target.z + 0.01 + span * 0.15), n: preset.n + 1 });
            }}
          >
            <RotateCcw size={17} /> Inside
          </button>
        </div>
        )}
        {tip && (
          <div className="view3d-tip" role="status">
            {tip}
          </div>
        )}

        <div className="view3d-info">
          {heightWarnings.length > 0 ? (
            <button className={`warn-badge static ${heightWarnings.some((w) => w.level === 'red') ? 'red' : 'yellow'}`} onClick={() => setShowWarn(!showWarn)}>
              {heightWarnings.length} height warning{heightWarnings.length === 1 ? '' : 's'}
            </button>
          ) : (
            <span className="view3d-ok">No height problems</span>
          )}
          {estimates && <span className="view3d-note">Some heights are typical sizes. Change them in the 2D plan.</span>}
          {showWarn && heightWarnings.length > 0 && (
            <div className="view3d-warn-list">
              <WarningsPanel warnings={heightWarnings} onPick={() => setShowWarn(false)} />
            </div>
          )}
        </div>
      </div>
      <p className="view3d-help">{editable ? 'Tap a thing to pick it · ' : ''}One finger to turn · pinch to zoom · two fingers to move</p>
      {adding && (
        <Dialog title={`Add to ${multi ? floors[addTo].name : 'the room'}`} subtitle="Tap an item. Then tap the floor in 3D to put it there." onClose={() => setAdding(false)}>
          <FurniturePanel multi={multi} unit={unit} templates={templates} onPick={addPick} onCustom={() => setTip('Make custom items in the 2D plan.')} onDeleteTemplate={() => {}} />
        </Dialog>
      )}
    </div>
  );
}
