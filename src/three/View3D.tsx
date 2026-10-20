import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ArrowLeft, Box as BoxIcon, Eye, RotateCcw, Scissors } from 'lucide-react';
import type { Floor, Item, Room, Unit } from '../model/types';
import { itemElevation, itemHeight, itemMount, itemOpenBelow, isStairs } from '../model/catalog';
import { DEFAULT_CEILING, DEFAULT_SILL, DEFAULT_WINDOW_H, FAN_DROP, roomOfPoint, type WarningResult } from '../geometry/warnings';
import { DOOR_HEIGHT, neighbors, openingGeom, sideLine, SIDES, wallThickness } from '../geometry/walls';
import { byDepth, flushWithParent, kindOf, parentOf } from '../geometry/spaces';
import { polyBox } from '../geometry/poly';
import { floorBounds } from '../geometry/view';
import { WarningsPanel } from '../editor/panels/WarningsPanel';
import { useResolvedTheme } from '../hooks/useTheme';
import './View3D.css';

const M = 1 / 1000; // mm → metres
const CUT_HEIGHT = 1000;

interface Props {
  floor: Floor;
  homeName: string;
  layoutName: string;
  unit: Unit;
  warnings: WarningResult;
  onClose: () => void;
}

interface WallPiece {
  key: string;
  pos: [number, number, number];
  size: [number, number, number];
  glass?: boolean;
}

const RAILING = 1000; // balcony railing height

function ceilingOf(floor: Floor, r: Room): number {
  let cur: Room | undefined = r;
  for (let i = 0; cur && i < 10; i++) {
    if (cur.ceilingMm) return cur.ceilingMm;
    cur = parentOf(floor, cur);
  }
  return DEFAULT_CEILING;
}

/** Wall boxes for every room side, with gaps for doors and windows (from either side of the wall). */
function buildWalls(floor: Floor, cut: boolean): WallPiece[] {
  const out: WallPiece[] = [];
  // every door/window as a box through the wall
  const cuts = floor.openings.flatMap((o) => {
    const room = floor.rooms.find((r) => r.id === o.roomId);
    return room ? [{ o, b: polyBox(openingGeom(floor, room, o).cut) }] : [];
  });
  for (const r of floor.rooms) {
    const H = ceilingOf(floor, r);
    const balcony = kindOf(r) === 'balcony';
    for (const side of SIDES) {
      if (flushWithParent(floor, r, side)) continue; // the outer room's wall is already there
      const line = sideLine(r, side);
      const t = wallThickness(floor, r, side);
      if (t <= 0) continue;
      const shared = neighbors(floor, r).some((n) => n.side === side);
      const fullTop = balcony && !shared ? RAILING : H;
      const top = cut ? Math.min(fullTop, CUT_HEIGHT) : fullTop;
      const horiz = side === 'top' || side === 'bottom';
      // horizontal walls run past the corners so the corners are closed
      const ext = horiz ? [wallThickness(floor, r, 'left'), wallThickness(floor, r, 'right')] : [0, 0];
      const band =
        side === 'top' ? { lo: r.y - t, hi: r.y } : side === 'bottom' ? { lo: r.y + r.length, hi: r.y + r.length + t } : side === 'left' ? { lo: r.x - t, hi: r.x } : { lo: r.x + r.width, hi: r.x + r.width + t };
      const ops = cuts
        .filter(({ b }) => {
          const lo = horiz ? b.minY : b.minX;
          const hi = horiz ? b.maxY : b.maxX;
          return Math.min(hi, band.hi) - Math.max(lo, band.lo) > 1;
        })
        .map(({ o, b }) => ({ o, from: (horiz ? b.minX : b.minY) - (horiz ? line.a.x : line.a.y), to: (horiz ? b.maxX : b.maxY) - (horiz ? line.a.x : line.a.y) }))
        .filter((x) => x.to > -ext[0] && x.from < line.length + ext[1])
        .sort((a, b) => a.from - b.from);

      const piece = (from: number, to: number, y0: number, y1: number, key: string, glass = false) => {
        if (to - from < 1 || y1 - y0 < 1) return;
        const len = to - from;
        const mid = (from + to) / 2;
        // centre of the wall thickness, outside the inner face
        const off = -t / 2;
        const cx = horiz ? line.a.x + mid : line.a.x + line.inward.x * off;
        const cz = horiz ? line.a.y + line.inward.y * off : line.a.y + mid;
        const sx = horiz ? len : glass ? t * 0.25 : t;
        const sz = horiz ? (glass ? t * 0.25 : t) : len;
        out.push({ key, pos: [cx * M, ((y0 + y1) / 2) * M, cz * M], size: [sx * M, (y1 - y0) * M, sz * M], glass });
      };

      let cursor = -ext[0];
      ops.forEach(({ o, from, to }, i) => {
        if (from > cursor) piece(cursor, from, 0, top, `${r.id}${side}s${i}`);
        const a = Math.max(from, cursor);
        if (o.kind === 'door') {
          piece(a, to, Math.min(o.doorType === 'shutter' ? 2400 : DOOR_HEIGHT, top), top, `${r.id}${side}d${i}`);
        } else {
          const sill = o.sillMm ?? DEFAULT_SILL;
          const wh = o.heightMm ?? DEFAULT_WINDOW_H;
          piece(a, to, 0, Math.min(sill, top), `${r.id}${side}wb${i}`);
          piece(a, to, Math.min(sill + wh, top), top, `${r.id}${side}wt${i}`);
          piece(a, to, Math.min(sill, top), Math.min(sill + wh, top), `${r.id}${side}wg${i}`, true);
        }
        cursor = Math.max(cursor, to);
      });
      piece(cursor, line.length + ext[1], 0, top, `${r.id}${side}end`);
    }
  }
  return out;
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

function ItemMesh({ it, floor, state }: { it: Item; floor: Floor; state: 'red' | 'yellow' | null }) {
  const room = roomOfPoint(floor, it);
  const ceiling = room ? ceilingOf(floor, room) : DEFAULT_CEILING;
  const mount = itemMount(it);
  let h = itemHeight(it) ?? 750;
  let y0 = mount === 'floor' ? itemElevation(it) : 0;
  const open = mount === 'floor' && !isStairs(it) && it.shape === 'rect' && it.type !== 'bed-bunk' ? itemOpenBelow(it) : 0;
  if (mount === 'under') h = 12;
  if (isStairs(it)) h = Math.min(ceiling, 3000);
  if (mount === 'ceiling') {
    y0 = (it.heightMm ?? ceiling - FAN_DROP) - 40;
    h = 40;
  }
  const color = state === 'red' ? '#ff4d4d' : it.color;
  const emissive = state === 'red' ? '#7a0000' : state === 'yellow' ? '#6b4e00' : '#000000';
  const rotY = (-it.rotation * Math.PI) / 180;
  const pos: [number, number, number] = [it.x * M, (y0 + h / 2) * M, it.y * M];

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

export default function View3D({ floor, homeName, layoutName, warnings, onClose }: Props) {
  const theme = useResolvedTheme();
  const [cut, setCut] = useState(false);
  const [lost, setLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [showWarn, setShowWarn] = useState(false);

  const b = floorBounds(floor) ?? { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * M;
  const target = useMemo(() => new THREE.Vector3(((b.minX + b.maxX) / 2) * M, 0.8, ((b.minY + b.maxY) / 2) * M), [b.minX, b.maxX, b.minY, b.maxY]);
  const corner = () => {
    // narrow phone screens need the camera further back to fit the room sideways
    const aspect = window.innerWidth / Math.max(1, window.innerHeight - 160);
    const d = (span * 1.35 + 2.2) * Math.max(1, 0.95 / aspect);
    return new THREE.Vector3(target.x + d * 0.55, d * 0.75, target.z + d * 0.75);
  };
  const [preset, setPreset] = useState({ pos: corner(), n: 0 });

  const walls = useMemo(() => buildWalls(floor, cut), [floor, cut]);
  const heightWarnings = warnings.list.filter((w) => /^(tall|window|fan):/.test(w.id));
  const estimates = floor.items.some((i) => i.heightMm === undefined && itemMount(i) === 'floor') || floor.rooms.some((r) => r.ceilingMm === undefined);
  const dark = theme === 'dark';

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
            camera={{ position: preset.pos.toArray(), fov: 50, near: 0.05, far: 200 }}
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
            <directionalLight position={[target.x + 5, 8, target.z + 3]} intensity={1.4} />
            <directionalLight position={[target.x - 4, 5, target.z - 6]} intensity={0.5} />
            <Controls target={target} preset={preset} />

            {/* ground */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[target.x, -0.003, target.z]}>
              <planeGeometry args={[span * 3 + 4, span * 3 + 4]} />
              <meshStandardMaterial color={dark ? '#1d2026' : '#e3e6ea'} />
            </mesh>
            {byDepth(floor).map(({ room: r, depth }) => (
              <mesh key={r.id} rotation={[-Math.PI / 2, 0, 0]} position={[(r.x + r.width / 2) * M, 0.001 + depth * 0.002, (r.y + r.length / 2) * M]}>
                <planeGeometry args={[r.width * M, r.length * M]} />
                <meshStandardMaterial color={(FLOOR_3D[kindOf(r)] ?? FLOOR_3D.room)[dark ? 1 : 0]} />
              </mesh>
            ))}
            {walls.map((w) => (
              <mesh key={w.key} position={w.pos}>
                <boxGeometry args={w.size} />
                {w.glass ? (
                  <meshStandardMaterial color="#8ec5ff" transparent opacity={0.35} />
                ) : (
                  <meshStandardMaterial color={dark ? '#c9ced6' : '#fafafa'} roughness={0.95} />
                )}
              </mesh>
            ))}
            {floor.items.map((it) => (
              <ItemMesh key={it.id} it={it} floor={floor} state={warnings.red.has(it.id) ? 'red' : warnings.yellow.has(it.id) ? 'yellow' : null} />
            ))}
          </Canvas>
        )}

        <div className="view3d-presets">
          <button className="btn" onClick={() => setPreset({ pos: new THREE.Vector3(target.x, span * 1.6 + 2, target.z + 0.01), n: preset.n + 1 })}>
            <Eye size={17} /> Top
          </button>
          <button className="btn" onClick={() => setPreset({ pos: corner(), n: preset.n + 1 })}>
            <BoxIcon size={17} /> Corner
          </button>
          <button className="btn" onClick={() => setPreset({ pos: new THREE.Vector3(target.x, 1.6, target.z + 0.01 + span * 0.15), n: preset.n + 1 })}>
            <RotateCcw size={17} /> Inside
          </button>
        </div>

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
      <p className="view3d-help">One finger to turn · pinch to zoom · two fingers to move</p>
    </div>
  );
}
