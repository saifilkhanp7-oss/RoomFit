import { floorHeight } from '../geometry/levels';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Box, ChevronDown, Copy, DoorOpen, Grid3x3, Image as ImageIcon, Layers, Maximize, Minus,
  MoreHorizontal, Pencil, Plus, Redo2, RotateCcw, RotateCw, Ruler, Settings as SettingsIcon, Share2, Sofa, SquarePlus,
  Trash2, Undo2, X, AppWindow, FileDown, HelpCircle, Eye, UserRound, SquareDashed, Car, ArrowDownToLine, Calculator, BrickWall, Route, PackageOpen, Users, Plug, Footprints,
} from 'lucide-react';
import { PointPanel } from '../editor/panels/PointPanel';
import { CoverPanel } from '../editor/panels/CoverPanel';
import { hitPoint, kindInfo, pointPos } from '../geometry/power';
import { MyThingsDialog } from '../editor/MyThingsDialog';
import { RoommatesDialog } from '../editor/RoommatesDialog';
import { checkRoute, type RouteResult } from '../geometry/route';
import { PartitionPanel } from '../editor/panels/PartitionPanel';
import { ZonePanel } from '../editor/panels/ZonePanel';
import { hitPartition, PARTITION_DEFAULT, partitionPoly, straighten } from '../geometry/partitions';
import type { RouteDrawing } from '../editor/canvas/draw';
import { EstimateDialog } from '../editor/EstimateDialog';
import { canRedo, canUndo, findHome, useAppStore } from '../store/useAppStore';
import { navigate } from '../router';
import { ThemeToggle } from '../components/ThemeToggle';
import { Dialog, ConfirmDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import { SettingsDialog } from '../components/SettingsDialog';
import { PlanCanvas } from '../editor/canvas/PlanCanvas';
import { PALETTES, type Measurement, type Selection } from '../editor/canvas/draw';
import type { DragSession } from '../editor/gestures/useCanvasGestures';
import { FurniturePanel, type Pickable } from '../editor/panels/FurniturePanel';
import { ItemPanel } from '../editor/panels/ItemPanel';
import { OpeningPanel } from '../editor/panels/OpeningPanel';
import { RoomPanel } from '../editor/panels/RoomPanel';
import { WarningsPanel } from '../editor/panels/WarningsPanel';
import { AddRoomDialog, HallDialog, CustomItemDialog, downloadBackup, ExportDialog, FloorMenu, LayoutsDialog, ShareDialog } from '../editor/dialogs';
import { useResolvedTheme } from '../hooks/useTheme';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { fitView, floorBounds, screenToWorld, zoomAt } from '../geometry/view';
import { itemBox, itemPoly, normAngle, rotationHandle } from '../geometry/items';
import { distPointSeg, pointInPoly, polyBox, type Poly, type Pt } from '../geometry/poly';
import { hitWall, innerWallOf, openingGeom, sideLine } from '../geometry/walls';
import { computeWarnings, coverHeadroom, nearestPlug, roomOfPoint, stairOpenings, DEFAULT_SILL, DEFAULT_WINDOW_H, type Warning } from '../geometry/warnings';
import { rotationFacingWall, snapItemBox, snapRoom, type Guide } from '../geometry/snapping';
import { snapMeasurePoint } from '../geometry/measure';
import * as ops from '../model/ops';
import { isStairs, itemElevation, itemHeight, itemMount, itemSpan } from '../model/catalog';
import { id as newId } from '../model/defaults';
import { MM_PER_FOOT, MM_PER_INCH } from '../model/units';
import type { Floor, Item, LayoutView, Partition, Side, Zone } from '../model/types';
import { AccountDialog } from '../auth/AccountDialog';
import { useAuth } from '../auth/useAuth';
import { byDepth, kindOf, ROOM_KINDS } from '../geometry/spaces';
import { formatLength } from '../model/units';
import './Editor.css';

const View3D = lazy(() => import('../three/View3D'));

type Mode = 'select' | 'measure' | 'door' | 'window' | 'wall' | 'zone' | 'plug' | 'cover';
type Sheet = null | 'hall' | 'makeMulti' | 'addFloorMenu' | 'account' | 'add' | 'props' | 'warnings' | 'rooms' | 'addRoom' | 'custom' | 'layouts' | 'share' | 'export' | 'more' | 'settings' | 'floorMenu' | 'deleteRoom' | 'estimate' | 'mythings' | 'roommates';

// Carry zoom + floor over when switching layouts, so "Layout A" vs "Layout B" compare at the same spot.
const carry: { view?: LayoutView; floorIndex?: number } = {};

export function Editor({ homeId, layoutId, show3d }: { homeId: string; layoutId: string; show3d: boolean }) {
  const home = useAppStore((s) => findHome(s.data, homeId));
  const layout = home?.layouts.find((l) => l.id === layoutId);
  if (!home || !layout) {
    return (
      <div className="editor-missing">
        <h2>Plan not found</h2>
        <p>It may have been deleted, or it was saved in a different browser.</p>
        <button className="btn btn-primary" onClick={() => navigate('/', true)}>
          Go to your homes
        </button>
      </div>
    );
  }
  return <EditorInner key={layout.id} homeId={homeId} layoutId={layoutId} show3d={show3d} />;
}

const distToPoly = (p: Pt, poly: Poly) => {
  if (pointInPoly(p, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distPointSeg(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
};

function EditorInner({ homeId, layoutId, show3d }: { homeId: string; layoutId: string; show3d: boolean }) {
  const home = useAppStore((s) => findHome(s.data, homeId))!;
  const layout = home.layouts.find((l) => l.id === layoutId)!;
  const settings = useAppStore((s) => s.data.settings);
  const templates = useAppStore((s) => s.data.customItemTemplates);
  const allHomes = useAppStore((s) => s.data.homes);
  const lastOpened = useAppStore((s) => s.data.lastOpened);
  useAppStore((s) => s.histVersion); // re-render undo/redo buttons
  const S = useAppStore.getState();
  const theme = useResolvedTheme();
  const wide = useMediaQuery('(min-width: 900px)');
  const toast = useToast((s) => s.show);
  const unit = settings.unit;
  const multi = home.kind === 'multi';
  const heights = true;

  // ---------- floor ----------
  const [floorId, setFloorId] = useState(() => {
    const ids = layout.floors.map((f) => f.id);
    if (carry.floorIndex !== undefined && ids[carry.floorIndex]) return ids[carry.floorIndex];
    const c = [layout.view?.floorId, lastOpened?.layoutId === layoutId ? lastOpened.floorId : undefined];
    return c.find((x) => x && ids.includes(x)) ?? ids[0];
  });
  const floorIndex = Math.max(0, layout.floors.findIndex((f) => f.id === floorId));
  const floor = layout.floors[floorIndex];
  const floorBelow = floorIndex > 0 ? layout.floors[floorIndex - 1] : undefined;
  const floorRef = useRef(floor);
  floorRef.current = floor;

  // ---------- view ----------
  const [view, setView] = useState<LayoutView | null>(() => {
    const v = carry.view ?? layout.view ?? null;
    carry.view = undefined;
    carry.floorIndex = undefined;
    return v;
  });
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef({ w: 0, h: 0 });
  const areaRef = useRef<HTMLDivElement>(null);

  // ---------- selection & tools ----------
  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [draft, setDraft] = useState<{ a: Pt; b?: Pt } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [ghost, setGhost] = useState(true);

  const selItem = selection?.kind === 'item' ? floor.items.find((i) => i.id === selection.id) : undefined;
  const selOpening = selection?.kind === 'opening' ? floor.openings.find((o) => o.id === selection.id) : undefined;
  const selRoom = selection?.kind === 'room' ? floor.rooms.find((r) => r.id === selection.id) : undefined;
  const selWall = selection?.kind === 'partition' ? floor.partitions?.find((p) => p.id === selection.id) : undefined;
  const selZone = selection?.kind === 'zone' ? floor.zones?.find((z) => z.id === selection.id) : undefined;
  const selPoint = selection?.kind === 'point' ? floor.points?.find((z) => z.id === selection.id) : undefined;
  const selCover = selection?.kind === 'cover' ? floor.covers?.find((z) => z.id === selection.id) : undefined;
  const sel: Selection = selItem || selOpening || selRoom || selWall || selZone || selPoint || selCover ? selection : null;
  const people = home.people ?? [];
  const [zonePerson, setZonePerson] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteDrawing | null>(null);

  const warnings = useMemo(
    () => computeWarnings(floor, { floorBelow, settings, unit, heights, people: home.people, stairRiseMm: floorIndex < layout.floors.length - 1 ? floorHeight(floor) : undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [floor, floorBelow, settings.minWalkMm, settings.fanClearanceMm, unit, heights, floorIndex, layout.floors.length, home.people],
  );
  const redCount = warnings.list.filter((w) => w.level === 'red').length;

  useEffect(() => {
    S.setLastOpened(homeId, layoutId, floor.id);
  }, [homeId, layoutId, floor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = useCallback(
    (fn: (f: Floor) => Floor, opts?: { history?: boolean }) => S.editFloor(homeId, layoutId, floorRef.current.id, fn, opts),
    [homeId, layoutId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---------- view helpers ----------
  const persistView = useCallback(() => {
    if (viewRef.current) S.setView(homeId, layoutId, { ...viewRef.current, floorId: floorRef.current.id });
  }, [homeId, layoutId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const v = fitView(floorBounds(floorRef.current), w, h, floorRef.current.id, { top: 64, right: 40, bottom: 112, left: 56 });
    setView(v);
    S.setView(homeId, layoutId, v);
  }, [homeId, layoutId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onResize = useCallback(
    (w: number, h: number) => {
      sizeRef.current = { w, h };
      if (!viewRef.current) fit();
    },
    [fit],
  );

  const zoomBy = (factor: number) => {
    const v = viewRef.current;
    const { w, h } = sizeRef.current;
    if (!v) return;
    const nv = zoomAt(v, v.zoom * factor, w / 2, h / 2);
    setView(nv);
    S.setView(homeId, layoutId, { ...nv, floorId: floor.id });
  };

  const centreOn = (p: Pt) => {
    const v = viewRef.current;
    const { w, h } = sizeRef.current;
    if (!v) return;
    const nv = { ...v, panX: w / 2 - p.x * v.zoom, panY: h / 2 - p.y * v.zoom };
    setView(nv);
    S.setView(homeId, layoutId, { ...nv, floorId: floor.id });
  };

  const world = (sx: number, sy: number) => screenToWorld(viewRef.current!, sx, sy);
  const snapThr = () => Math.min(300, Math.max(30, 14 / (viewRef.current?.zoom ?? 0.1)));

  // ---------- hit testing ----------
  const hitItem = (p: Pt, f = floorRef.current): Item | undefined => {
    const tol = 6 / viewRef.current!.zoom;
    const layers = [
      f.items.filter((i) => itemMount(i) === 'floor').sort((a, b) => itemElevation(a) - itemElevation(b)),
      f.items.filter((i) => itemMount(i) === 'ceiling'),
      f.items.filter((i) => itemMount(i) === 'under'),
    ];
    for (const layer of layers) {
      for (let i = layer.length - 1; i >= 0; i--) if (distToPoly(p, itemPoly(layer[i])) <= tol) return layer[i];
    }
    return undefined;
  };
  const hitOpening = (p: Pt, f = floorRef.current) => {
    const tol = 12 / viewRef.current!.zoom;
    return f.openings.find((o) => {
      const r = f.rooms.find((x) => x.id === o.roomId);
      return r && distToPoly(p, openingGeom(f, r, o).cut) <= tol;
    });
  };

  // ---------- drag sessions ----------
  const onPointerDown = (sx: number, sy: number): DragSession | null => {
    if (!viewRef.current) return null;
    const p = world(sx, sy);
    const f = floorRef.current;
    const zoom = viewRef.current.zoom;

    if (mode === 'measure') {
      const a = snapMeasurePoint(f, p, 14 / zoom);
      let b: Pt | null = null;
      return {
        move: (x, y) => {
          b = snapMeasurePoint(floorRef.current, world(x, y), 14 / viewRef.current!.zoom);
          setDraft({ a, b });
        },
        end: (moved) => {
          if (moved && b) {
            setMeasurements((m) => [...m, { a, b: b! }]);
            setDraft(null);
          }
        },
      };
    }
    if (mode === 'cover') {
      const a = roundPt(p);
      let b: Pt | null = null;
      return {
        move: (x, y) => {
          b = roundPt(world(x, y));
          setDraft({ a, b });
        },
        end: (moved) => {
          if (moved && b) addCoverRect(a, b);
        },
      };
    }
    if (mode === 'wall' || mode === 'zone') {
      const a = mode === 'wall' ? snapMeasurePoint(f, p, 14 / zoom) : roundPt(p);
      let b: Pt | null = null;
      return {
        move: (x, y) => {
          const q = world(x, y);
          b = mode === 'wall' ? straighten(a, snapMeasurePoint(floorRef.current, q, 14 / viewRef.current!.zoom)) : roundPt(q);
          setDraft({ a, b });
        },
        end: (moved) => {
          if (moved && b) {
            if (mode === 'wall') addWall(a, b);
            else addZoneRect(a, b);
          }
        },
      };
    }
    if (mode !== 'select') return null;

    // ends of the selected inner wall, corner of the selected space
    if (selWall) {
      for (const end of ['a', 'b'] as const) {
        const e = selWall[end];
        if (Math.hypot(p.x - e.x, p.y - e.y) < 18 / zoom) return wallEndSession(selWall.id, end);
      }
    }
    if (selZone && Math.hypot(p.x - (selZone.x + selZone.width), p.y - (selZone.y + selZone.length)) < 18 / zoom) return zoneResizeSession(selZone.id);
    if (selCover && Math.hypot(p.x - (selCover.x + selCover.width), p.y - (selCover.y + selCover.length)) < 18 / zoom) return coverResizeSession(selCover.id);

    // rotation handle of the selected item
    const cur = selection?.kind === 'item' ? f.items.find((i) => i.id === selection.id) : undefined;
    if (cur && !cur.locked) {
      const h = rotationHandle(cur, zoom);
      if (Math.hypot(p.x - h.x, p.y - h.y) < 20 / zoom) return rotateSession(cur);
    }

    const it = hitItem(p);
    if (it) return it.locked ? null : itemSession(it, p);

    const pp = hitPoint(f, p, 6 / zoom);
    if (pp) return pointSession(pp.id, p);

    const op = hitOpening(p);
    if (op) return openingSession(op.id, p);

    const pw = hitPartition(f, p, 8 / zoom);
    if (pw) return wallMoveSession(pw.id, p);
    if (selZone && inZone(selZone, p)) return zoneMoveSession(selZone.id, p);
    if (selCover && inZone(selCover, p)) return coverMoveSession(selCover.id, p);

    if (selection?.kind === 'room' && f.rooms.length > 1) {
      const r = f.rooms.find((x) => x.id === selection.id);
      if (r && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.length) return roomSession(r.id, p);
    }
    return null;
  };

  const itemSession = (it: Item, p0: Pt): DragSession => {
    let started = false;
    return {
      move: (sx, sy) => {
        const q = world(sx, sy);
        if (!started) {
          started = true;
          S.checkpoint(homeId, layoutId);
          setSelection({ kind: 'item', id: it.id });
          setDragging(true);
        }
        let nx = it.x + (q.x - p0.x);
        let ny = it.y + (q.y - p0.y);
        let g: Guide[] = [];
        if (settings.snap) {
          const r = snapItemBox(itemBox({ ...it, x: nx, y: ny }), floorRef.current, it.id, snapThr(), itemMount(it));
          nx += r.dx;
          ny += r.dy;
          g = r.guides;
        }
        setGuides(g);
        edit((f) => ops.updateItem(f, it.id, { x: Math.round(nx), y: Math.round(ny) }), { history: false });
      },
      end: () => {
        setGuides([]);
        setDragging(false);
      },
    };
  };

  const rotateSession = (it: Item): DragSession => {
    let started = false;
    return {
      move: (sx, sy) => {
        const q = world(sx, sy);
        if (!started) {
          started = true;
          S.checkpoint(homeId, layoutId);
          setDragging(true);
        }
        let a = (Math.atan2(q.y - it.y, q.x - it.x) * 180) / Math.PI + 90;
        if (settings.snap) {
          const near = Math.round(a / 15) * 15;
          if (Math.abs(a - near) < 5) a = near;
        }
        edit((f) => ops.updateItem(f, it.id, { rotation: normAngle(a) }), { history: false });
      },
      end: () => setDragging(false),
    };
  };

  const openingSession = (opId: string, p0: Pt): DragSession => {
    const f0 = floorRef.current;
    const op = f0.openings.find((o) => o.id === opId)!;
    const room = f0.rooms.find((r) => r.id === op.roomId)!;
    const horiz = op.side === 'top' || op.side === 'bottom';
    const along = (q: Pt) => (horiz ? q.x - room.x : q.y - room.y);
    const grab = along(p0) - op.offsetMm;
    const len = sideLine(room, op.side).length;
    let started = false;
    return {
      move: (sx, sy) => {
        if (!started) {
          started = true;
          S.checkpoint(homeId, layoutId);
          setSelection({ kind: 'opening', id: opId });
          setDragging(true);
        }
        const off = Math.max(0, Math.min(len - op.widthMm, along(world(sx, sy)) - grab));
        edit((f) => ops.updateOpening(f, opId, { offsetMm: Math.round(off) }), { history: false });
      },
      end: () => setDragging(false),
    };
  };

  const roomSession = (roomId: string, p0: Pt): DragSession => {
    const r0 = floorRef.current.rooms.find((r) => r.id === roomId)!;
    const group = ops.roomGroup(floorRef.current, roomId); // what's inside moves with it
    let started = false;
    return {
      move: (sx, sy) => {
        if (!started) {
          started = true;
          S.checkpoint(homeId, layoutId);
          setDragging(true);
        }
        const q = world(sx, sy);
        let nx = r0.x + (q.x - p0.x);
        let ny = r0.y + (q.y - p0.y);
        let g: Guide[] = [];
        if (settings.snap) {
          const f = floorRef.current;
          const s = snapRoom({ ...r0, x: nx, y: ny }, f, innerWallOf(f), snapThr() * 1.5);
          nx += s.dx;
          ny += s.dy;
          g = s.guides;
        }
        setGuides(g);
        edit((f) => ops.updateRoom(f, roomId, { x: Math.round(nx), y: Math.round(ny) }, group), { history: false });
      },
      end: () => {
        setGuides([]);
        setDragging(false);
      },
    };
  };

  // ---------- inner walls & roommates' spaces ----------
  const roundPt = (q: Pt): Pt => ({ x: Math.round(q.x), y: Math.round(q.y) });
  const inZone = (zn: { x: number; y: number; width: number; length: number }, q: Pt) => q.x >= zn.x && q.x <= zn.x + zn.width && q.y >= zn.y && q.y <= zn.y + zn.length;
  const addWall = (a: Pt, b: Pt) => {
    setDraft(null);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 150) return toast('Too short. Drag a longer line.');
    const pw: Partition = { id: newId(), a: roundPt(a), b: roundPt(b), thicknessMm: PARTITION_DEFAULT, bottomMm: 0 };
    edit((f) => ops.addPartition(f, pw));
    setMode('select');
    setSelection({ kind: 'partition', id: pw.id });
    toast('Wall added. Set its height in its settings.');
  };
  const addZoneRect = (a: Pt, b: Pt) => {
    setDraft(null);
    const person = zonePerson ?? people[0]?.id;
    if (!person) return;
    const zn: Zone = { id: newId(), personId: person, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), length: Math.abs(b.y - a.y) };
    if (zn.width < 300 || zn.length < 300) return toast('Too small. Drag across the space.');
    edit((f) => ops.addZone(f, zn));
    setMode('select');
    setSelection({ kind: 'zone', id: zn.id });
    toast(`${people.find((x) => x.id === person)?.name ?? 'Their'}'s space added`);
  };
  const dragSession = (apply: (q: Pt) => void, onEnd?: () => void): DragSession => {
    let started = false;
    return {
      move: (sx, sy) => {
        if (!started) {
          started = true;
          S.checkpoint(homeId, layoutId);
          setDragging(true);
        }
        apply(world(sx, sy));
      },
      end: () => {
        setDragging(false);
        onEnd?.();
      },
    };
  };
  const wallMoveSession = (pid: string, p0: Pt) => {
    const w0 = floorRef.current.partitions!.find((x) => x.id === pid)!;
    return dragSession((q) => {
      setSelection({ kind: 'partition', id: pid });
      const dx = Math.round(q.x - p0.x);
      const dy = Math.round(q.y - p0.y);
      edit((f) => ops.updatePartition(f, pid, { a: { x: w0.a.x + dx, y: w0.a.y + dy }, b: { x: w0.b.x + dx, y: w0.b.y + dy } }), { history: false });
    });
  };
  const wallEndSession = (pid: string, end: 'a' | 'b') => {
    const w0 = floorRef.current.partitions!.find((x) => x.id === pid)!;
    const other = end === 'a' ? w0.b : w0.a;
    return dragSession((q) => {
      const s = straighten(other, snapMeasurePoint(floorRef.current, q, 14 / viewRef.current!.zoom));
      edit((f) => ops.updatePartition(f, pid, { [end]: roundPt(s) }), { history: false });
    });
  };
  const coverMoveSession = (cid: string, p0: Pt) => {
    const c0 = floorRef.current.covers!.find((x) => x.id === cid)!;
    return dragSession((q) => edit((f) => ops.updateCover(f, cid, { x: Math.round(c0.x + q.x - p0.x), y: Math.round(c0.y + q.y - p0.y) }), { history: false }));
  };
  const coverResizeSession = (cid: string) => {
    const c0 = floorRef.current.covers!.find((x) => x.id === cid)!;
    return dragSession((q) => edit((f) => ops.updateCover(f, cid, { width: Math.max(100, Math.round(q.x - c0.x)), length: Math.max(100, Math.round(q.y - c0.y)) }), { history: false }));
  };
  const addCoverRect = (a: Pt, b: Pt) => {
    setDraft(null);
    let r = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
    // keep it on the stair opening
    const holes = stairOpenings(floorBelow).map((so) => polyBox(so.poly));
    const hole = holes.find((h) => h.minX < r.maxX && r.minX < h.maxX && h.minY < r.maxY && r.minY < h.maxY);
    if (!hole) return toast('Drag over the stair opening');
    r = { minX: Math.max(r.minX, hole.minX), minY: Math.max(r.minY, hole.minY), maxX: Math.min(r.maxX, hole.maxX), maxY: Math.min(r.maxY, hole.maxY) };
    if (r.maxX - r.minX < 100 || r.maxY - r.minY < 100) return toast('Too small. Drag across the stairs.');
    const cv = { id: newId(), x: Math.round(r.minX), y: Math.round(r.minY), width: Math.round(r.maxX - r.minX), length: Math.round(r.maxY - r.minY) };
    edit((f) => ops.addCover(f, cv));
    setMode('select');
    setSelection({ kind: 'cover', id: cv.id });
    const hr = coverHeadroom(floorBelow, cv);
    toast(isFinite(hr) ? `Floor added. Head room on the stairs under it: ${formatLength(Math.max(0, hr), unit)}` : 'Floor added over the stairs');
  };
  const pointSession = (pid: string, p0: Pt): DragSession => {
    const f0 = floorRef.current;
    const pt = f0.points!.find((x) => x.id === pid)!;
    const room = f0.rooms.find((r) => r.id === pt.roomId);
    if (!room) return dragSession(() => {});
    const horiz = pt.side === 'top' || pt.side === 'bottom';
    const along = (q: Pt) => (horiz ? q.x - room.x : q.y - room.y);
    const grab = along(p0) - pt.offsetMm;
    const len = sideLine(room, pt.side).length;
    return dragSession((q) => {
      setSelection({ kind: 'point', id: pid });
      edit((f) => ops.updatePoint(f, pid, { offsetMm: Math.round(Math.max(0, Math.min(len, along(q) - grab))) }), { history: false });
    });
  };
  const addPointAt = (p: Pt) => {
    const f = floorRef.current;
    const hit = hitWall(f, p, 24 / viewRef.current!.zoom);
    if (!hit) return toast('Tap on a wall');
    const pt = { id: newId(), roomId: hit.room.id, side: hit.side, offsetMm: Math.round(Math.max(0, Math.min(sideLine(hit.room, hit.side).length, hit.along))), kind: 'board' as const };
    edit((fl) => ops.addPoint(fl, pt));
    setSelection({ kind: 'point', id: pt.id });
    toast('Switchboard added. Change the kind in its settings, or tap another wall.');
  };

  const zoneMoveSession = (zid: string, p0: Pt) => {
    const z0 = floorRef.current.zones!.find((x) => x.id === zid)!;
    return dragSession((q) => edit((f) => ops.updateZone(f, zid, { x: Math.round(z0.x + q.x - p0.x), y: Math.round(z0.y + q.y - p0.y) }), { history: false }));
  };
  const zoneResizeSession = (zid: string) => {
    const z0 = floorRef.current.zones!.find((x) => x.id === zid)!;
    return dragSession((q) => edit((f) => ops.updateZone(f, zid, { width: Math.max(300, Math.round(q.x - z0.x)), length: Math.max(300, Math.round(q.y - z0.y)) }), { history: false }));
  };

  // ---------- will it get in? ----------
  const [routeInfo, setRouteInfo] = useState<{ itemId: string; result: RouteResult; furniture: boolean } | null>(null);
  const runRoute = (it: Item, furniture = false) => {
    const result = checkRoute(layout.floors, floorIndex, it, { furniture, fmt: (mm) => formatLength(mm, unit) });
    setRoute({ ok: result.ok, steps: result.steps });
    setRouteInfo({ itemId: it.id, result, furniture });
    if (!wide) setSheet(null);
  };
  const closeRoute = () => {
    setRoute(null);
    setRouteInfo(null);
  };
  useEffect(() => {
    if (routeInfo && (selection?.kind !== 'item' || selection.id !== routeInfo.itemId)) closeRoute();
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (routeInfo) closeRoute();
  }, [floor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- taps ----------
  const onTap = (sx: number, sy: number) => {
    if (!viewRef.current) return;
    const p = world(sx, sy);
    const f = floorRef.current;
    const zoom = viewRef.current.zoom;

    if (mode === 'measure') {
      const q = snapMeasurePoint(f, p, 14 / zoom);
      if (!draft) setDraft({ a: q });
      else {
        setMeasurements((m) => [...m, { a: draft.a, b: q }]);
        setDraft(null);
      }
      return;
    }
    if (mode === 'door' || mode === 'window') {
      addOpeningAt(p, mode);
      return;
    }
    if (mode === 'plug') return addPointAt(p);
    if (mode === 'cover') {
      if (!draft) setDraft({ a: roundPt(p) });
      else addCoverRect(draft.a, roundPt(p));
      return;
    }
    if (mode === 'wall' || mode === 'zone') {
      const q = mode === 'wall' ? snapMeasurePoint(f, p, 14 / zoom) : roundPt(p);
      if (!draft) setDraft({ a: q });
      else if (mode === 'wall') addWall(draft.a, straighten(draft.a, q));
      else addZoneRect(draft.a, q);
      return;
    }
    const it = hitItem(p);
    if (it) return setSelection({ kind: 'item', id: it.id });
    const pp = hitPoint(f, p, 6 / zoom);
    if (pp) return setSelection({ kind: 'point', id: pp.id });
    const op = hitOpening(p);
    if (op) return setSelection({ kind: 'opening', id: op.id });
    const pw = hitPartition(f, p, 8 / zoom);
    if (pw) return setSelection({ kind: 'partition', id: pw.id });
    // a space is picked first; tap it again to get the room under it
    const cv = [...(f.covers ?? [])].reverse().find((x) => inZone(x, p));
    if (cv && !(selection?.kind === 'cover' && selection.id === cv.id)) return setSelection({ kind: 'cover', id: cv.id });
    const zn = [...(f.zones ?? [])].reverse().find((x) => inZone(x, p));
    if (zn && !(selection?.kind === 'zone' && selection.id === zn.id)) return setSelection({ kind: 'zone', id: zn.id });
    const room = roomOfPoint(f, p);
    setSelection(room ? { kind: 'room', id: room.id } : null);
  };

  const addOpeningAt = (p: Pt, kind: 'door' | 'window') => {
    const f = floorRef.current;
    const hit = hitWall(f, p, 24 / viewRef.current!.zoom);
    if (!hit) {
      toast('Tap on a wall');
      return;
    }
    const len = sideLine(hit.room, hit.side).length;
    const garage = kind === 'door' && kindOf(hit.room) === 'parking';
    const width = Math.min(len, garage ? 2600 : kind === 'door' ? Math.round(3 * MM_PER_FOOT) : Math.round(4 * MM_PER_FOOT));
    const offset = Math.round(Math.max(0, Math.min(len - width, hit.along - width / 2)));
    const clash = f.openings.some((o) => o.roomId === hit.room.id && o.side === hit.side && o.offsetMm < offset + width && offset < o.offsetMm + o.widthMm);
    if (clash) {
      toast('There is already a door or window here');
      return;
    }
    const op = {
      id: newId(),
      kind,
      roomId: hit.room.id,
      side: hit.side,
      offsetMm: offset,
      widthMm: width,
      ...(kind === 'door'
        ? garage
          ? { doorType: 'shutter' as const }
          : { doorType: 'swing' as const, hinge: 'start' as const, opensInto: 'this' as const }
        : { sillMm: DEFAULT_SILL, heightMm: DEFAULT_WINDOW_H }),
    };
    edit((fl) => ops.addOpening(fl, op));
    setSelection({ kind: 'opening', id: op.id });
    setMode('select');
    toast(kind === 'door' ? 'Door added. Drag it along the wall.' : 'Window added');
  };

  // ---------- adding furniture ----------
  const addPickable = (pk: Pickable, at?: Pt) => {
    const f = floorRef.current;
    const src =
      pk.kind === 'catalog'
        ? { type: pk.entry.type, label: pk.entry.label, width: pk.entry.width, depth: pk.entry.depth, shape: pk.entry.shape, color: pk.entry.color, mount: pk.entry.mount, heightMm: undefined as number | undefined }
        : { type: pk.t.type || 'custom', label: pk.t.label, width: pk.t.width, depth: pk.t.depth, shape: pk.t.shape, color: pk.t.color, mount: undefined, heightMm: pk.t.heightMm };
    const v = viewRef.current!;
    const { w, h } = sizeRef.current;
    let pos = at ?? screenToWorld(v, w / 2, h / 2);
    let room = roomOfPoint(f, pos);
    if (!room && !at && f.rooms.length) {
      room = f.rooms[0];
      pos = { x: room.x + room.width / 2, y: room.y + room.length / 2 };
    }
    if (room && !at) {
      // keep it inside the room if it fits
      const hw = src.width / 2;
      const hd = src.depth / 2;
      if (src.width <= room.width) pos.x = Math.max(room.x + hw, Math.min(room.x + room.width - hw, pos.x));
      if (src.depth <= room.length) pos.y = Math.max(room.y + hd, Math.min(room.y + room.length - hd, pos.y));
    }
    let item: Item = {
      id: newId(),
      type: src.type,
      label: src.label,
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      width: src.width,
      depth: src.depth,
      rotation: 0,
      shape: src.shape,
      color: src.color,
      ...(src.mount ? { mount: src.mount } : {}),
      ...(src.heightMm ? { heightMm: src.heightMm } : {}),
      ...(home.meId && src.type !== 'stairs' ? { owner: home.meId } : {}),
      ...(pk.kind === 'catalog' && pk.entry.elevationMm ? { elevationMm: pk.entry.elevationMm } : {}),
    };
    if (item.type === 'stairs') item.stairs = { style: 'straight', flightWidthMm: 914, turn: 'right', upDir: 0 };
    // things fixed to a wall (AC, geyser, mirror, shelf) go flat against the nearest wall
    if (!at && room && pk.kind === 'catalog' && pk.entry.wallFixed) {
      const sides: [Side, number][] = [
        ['top', pos.y - room.y],
        ['bottom', room.y + room.length - pos.y],
        ['left', pos.x - room.x],
        ['right', room.x + room.width - pos.x],
      ];
      sides.sort((a, b) => a[1] - b[1]);
      const wall = sides[0][0];
      const d2 = item.depth / 2;
      const x = wall === 'left' ? room.x + d2 : wall === 'right' ? room.x + room.width - d2 : item.x;
      const y = wall === 'top' ? room.y + d2 : wall === 'bottom' ? room.y + room.length - d2 : item.y;
      item = { ...item, x: Math.round(x), y: Math.round(y), rotation: rotationFacingWall(wall) };
    }

    // Dropped near a wall: turn beds/cupboards to face into the room and push them flush.
    if (at && room && settings.snap) {
      const entry = pk.kind === 'catalog' ? pk.entry : undefined;
      const dists: [Side, number][] = [
        ['left', pos.x - room.x],
        ['right', room.x + room.width - pos.x],
        ['top', pos.y - room.y],
        ['bottom', room.y + room.length - pos.y],
      ];
      dists.sort((a, b) => a[1] - b[1]);
      const [wall, d] = dists[0];
      if (entry?.wallItem && d < item.depth / 2 + 600) item = { ...item, rotation: rotationFacingWall(wall) };
      const r = snapItemBox(itemBox(item), { ...f, items: f.items }, item.id, Math.max(snapThr(), 400), itemMount(item));
      item = { ...item, x: Math.round(item.x + r.dx), y: Math.round(item.y + r.dy) };
    }
    edit((fl) => ops.addItem(fl, item));
    setSelection({ kind: 'item', id: item.id });
    setMode('select');
    if (!wide) setSheet(null);
  };

  const onDropTile = (pk: Pickable, cx: number, cy: number) => {
    const el = areaRef.current;
    if (!el || !viewRef.current) return;
    const r = el.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return;
    addPickable(pk, world(cx - r.left, cy - r.top));
  };

  // ---------- item actions ----------
  const rotateBy = (deg: number) => selItem && !selItem.locked && edit((f) => ops.updateItemKeepInside(f, selItem.id, { rotation: normAngle(selItem.rotation + deg) }));
  const duplicate = () => {
    if (!selItem) return;
    let newSel: string | undefined;
    edit((f) => {
      const r = ops.duplicateItem(f, selItem.id, Math.round(MM_PER_FOOT));
      newSel = r.newId;
      return r.floor;
    });
    if (newSel) setSelection({ kind: 'item', id: newSel });
  };
  const deleteSelected = () => {
    if (selItem) edit((f) => ops.deleteItem(f, selItem.id));
    else if (selOpening) edit((f) => ops.deleteOpening(f, selOpening.id));
    else if (selWall) edit((f) => ops.deletePartition(f, selWall.id));
    else if (selZone) edit((f) => ops.deleteZone(f, selZone.id));
    else if (selPoint) edit((f) => ops.deletePoint(f, selPoint.id));
    else if (selCover) edit((f) => ops.deleteCover(f, selCover.id));
    else if (selRoom && floor.rooms.length > 1) return setSheet('deleteRoom');
    else return;
    setSelection(null);
    if (sheet === 'props') setSheet(null);
  };

  // ---------- stacking ----------
  const selSupport = selItem ? ops.supportUnder(floor, selItem.id) : undefined;
  const onTopAlready = !!(selItem && selSupport && Math.abs(itemElevation(selItem) - itemSpan(selSupport).top) < 30);
  const stackSelected = (support: Item) => {
    if (!selItem) return;
    edit((f) => ops.stackOn(f, selItem.id, support.id));
    toast(`${selItem.label} is now on top of ${support.label}`);
  };
  const applyFix = (w: Warning) => {
    const fx = w.fix;
    if (!fx) return;
    edit((f) => (fx.action === 'stack' ? ops.stackOn(f, fx.itemId, fx.supportId) : ops.putOnFloor(f, fx.itemId)));
    toast('Done');
  };
  const letItBe = (w: Warning, ok: boolean) => edit((f) => ops.setWarningOk(f, w.id, ok));

  const undo = () => {
    S.undo(homeId, layoutId);
    setGuides([]);
  };
  const redo = () => S.redo(homeId, layoutId);

  // ---------- keyboard (laptop) ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      if (sheet && !wide) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) return e.preventDefault(), undo();
      if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) return e.preventDefault(), redo();
      if (mod && k === 'd') return e.preventDefault(), duplicate();
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') return e.preventDefault(), deleteSelected();
      if (k === 'r' && selItem) return rotateBy(e.shiftKey ? -90 : 90);
      if (e.key === 'Escape') {
        if (mode !== 'select') setMode('select');
        setDraft(null);
        setSelection(null);
        return;
      }
      if (e.key.startsWith('Arrow') && selItem && !selItem.locked) {
        e.preventDefault();
        const step = unit === 'ft' ? (e.shiftKey ? MM_PER_FOOT : MM_PER_INCH) : e.shiftKey ? 100 : 10;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        edit((f) => ops.updateItem(f, selItem.id, { x: Math.round(selItem.x + dx), y: Math.round(selItem.y + dy) }));
        return;
      }
      if (e.key === '+' || e.key === '=') zoomBy(1.25);
      else if (e.key === '-') zoomBy(0.8);
      else if (e.key === '0') fit();
      else if (k === 'm') setMode(mode === 'measure' ? 'select' : 'measure');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickWarning = (w: Warning) => {
    if (w.itemIds[0]) setSelection({ kind: 'item', id: w.itemIds[0] });
    else if (w.id.startsWith('headroom:')) setSelection({ kind: 'cover', id: w.id.slice(9) });
    centreOn(w.focus);
    if (!wide) setSheet(null);
  };

  const switchLayout = (id: string) => {
    if (id === layoutId) return setSheet(null);
    carry.view = viewRef.current ?? undefined;
    carry.floorIndex = floorIndex;
    setSheet(null);
    navigate(`/edit/${homeId}/${id}`, true);
  };

  const addFloorAbove = () => {
    let nid = '';
    S.editLayout(homeId, layoutId, (l) => {
      const r = ops.addFloor(l);
      nid = r.floorId;
      return r.layout;
    });
    setSheet(null);
    if (nid) switchFloor(nid);
    toast('Floor added with the same rooms as below');
  };
  const addBasementFloor = () => {
    let nid = '';
    S.editLayout(homeId, layoutId, (l) => {
      const r = ops.addBasement(l);
      nid = r.floorId;
      return r.layout;
    });
    setSheet(null);
    if (nid) switchFloor(nid);
    setTimeout(fit, 30);
    toast('Basement added with a parking space. Add a car to check if it fits.');
  };

  const switchFloor = (id: string) => {
    setFloorId(id);
    setSelection(null);
    setDraft(null);
    setMeasurements([]);
  };

  // ---------- floating action bar position ----------
  const actionBar = (() => {
    if (!view || dragging || mode !== 'select' || !sel) return null;
    let poly: Pt[] | null = null;
    if (selItem) poly = itemPoly(selItem);
    else if (selOpening) {
      const r = floor.rooms.find((x) => x.id === selOpening.roomId);
      if (r) poly = openingGeom(floor, r, selOpening).cut;
    } else if (selRoom) poly = [{ x: selRoom.x, y: selRoom.y }, { x: selRoom.x + selRoom.width, y: selRoom.y }];
    else if (selWall) poly = partitionPoly(selWall);
    else if (selZone) poly = [{ x: selZone.x, y: selZone.y }, { x: selZone.x + selZone.width, y: selZone.y }];
    else if (selCover) poly = [{ x: selCover.x, y: selCover.y }, { x: selCover.x + selCover.width, y: selCover.y }];
    else if (selPoint) {
      const g = pointPos(floor, selPoint);
      if (g) poly = [g.pos, { x: g.pos.x + g.inward.x * 200, y: g.pos.y + g.inward.y * 200 }];
    }
    if (!poly) return null;
    const xs = poly.map((p) => p.x * view.zoom + view.panX);
    const ys = poly.map((p) => p.y * view.zoom + view.panY);
    const { w, h } = sizeRef.current;
    const cx = Math.max(130, Math.min(w - 130, (Math.min(...xs) + Math.max(...xs)) / 2));
    let top = Math.min(...ys) - (selItem && !selItem.locked ? 104 : 64);
    if (top < 56) top = Math.max(...ys) + 14;
    if (top > h - 160) top = h - 160;
    return { left: cx, top };
  })();

  const selectedPanel = () => {
    if (selItem)
      return (
        <ItemPanel
          item={selItem}
          unit={unit}
          heights={heights}
          ceilingMm={roomOfPoint(floor, selItem)?.ceilingMm}
          onChange={(patch) => edit((f) => ops.updateItemKeepInside(f, selItem.id, patch))}
          onRotate={rotateBy}
          onDuplicate={duplicate}
          onDelete={deleteSelected}
          support={selSupport}
          onStack={() => selSupport && stackSelected(selSupport)}
          onFloor={() => edit((f) => ops.putOnFloor(f, selItem.id))}
          people={people}
          plug={(floor.points ?? []).length ? nearestPlug(floor, selItem, false) : undefined}
          onRoute={itemMount(selItem) === 'floor' && !isStairs(selItem) ? () => runRoute(selItem) : undefined}
          onSaveTemplate={
            !isStairs(selItem) && !templates.some((t) => t.label === selItem.label && t.width === selItem.width && t.depth === selItem.depth)
              ? () => {
                  S.addTemplate({
                    id: newId(),
                    type: selItem.type,
                    label: selItem.label,
                    width: selItem.width,
                    depth: selItem.depth,
                    heightMm: itemHeight(selItem),
                    shape: selItem.shape,
                    color: selItem.color,
                  });
                  toast('Added to My things');
                }
              : undefined
          }
        />
      );
    if (selOpening)
      return (
        <OpeningPanel
          opening={selOpening}
          floor={floor}
          unit={unit}
          heights={heights}
          onChange={(patch) => edit((f) => ops.updateOpening(f, selOpening.id, patch))}
          onDelete={deleteSelected}
        />
      );
    if (selWall)
      return <PartitionPanel wall={selWall} floor={floor} unit={unit} onChange={(patch) => edit((f) => ops.updatePartition(f, selWall.id, patch))} onDelete={deleteSelected} />;
    if (selPoint) return <PointPanel point={selPoint} unit={unit} onChange={(patch) => edit((f) => ops.updatePoint(f, selPoint.id, patch))} onDelete={deleteSelected} />;
    if (selCover)
      return (
        <CoverPanel
          cover={selCover}
          unit={unit}
          headroom={coverHeadroom(floorBelow, selCover)}
          onChange={(patch) => edit((f) => ops.updateCover(f, selCover.id, patch))}
          onDelete={deleteSelected}
        />
      );
    if (selZone)
      return (
        <ZonePanel
          zone={selZone}
          people={people}
          unit={unit}
          items={floor.items}
          onChange={(patch) => edit((f) => ops.updateZone(f, selZone.id, patch))}
          onDelete={deleteSelected}
        />
      );
    if (selRoom)
      return (
        <RoomPanel
          idPrefix={wide ? 'side-room' : 'sheet-room'}
          room={selRoom}
          floor={floor}
          unit={unit}
          heights={heights}
          onChangeRoom={(patch) => edit((f) => ops.updateRoom(f, selRoom.id, patch))}
          onChangeFloor={(patch) => edit((f) => ({ ...f, ...patch }))}
          onSharedWall={(nid, side, mm) => edit((f) => ops.setSharedWall(f, selRoom.id, nid, side, mm))}
          onDelete={floor.rooms.length > 1 ? () => setSheet('deleteRoom') : undefined}
        />
      );
    return null;
  };
  const selTitle = selItem
    ? selItem.label
    : selOpening
      ? selOpening.kind === 'door'
        ? 'Door'
        : 'Window'
      : selPoint
        ? kindInfo(selPoint.kind).label
        : selCover
        ? 'Floor over stairs'
      : selWall
        ? 'Inner wall'
        : selZone
          ? `${people.find((x) => x.id === selZone.personId)?.name ?? 'Someone'}'s space`
          : selRoom
            ? selRoom.name
            : '';

  const scaleLabel = unit === 'ft' ? '1 square = 1 ft' : '1 square = 50 cm';
  const scalePx = view ? (unit === 'ft' ? MM_PER_FOOT : 500) * view.zoom : 0;

  const modeText =
    mode === 'door'
      ? 'Tap a wall to add a door'
      : mode === 'window'
        ? 'Tap a wall to add a window'
        : mode === 'measure'
          ? draft
            ? 'Tap the second point'
            : 'Tap two points, or drag, to measure'
          : mode === 'wall'
            ? draft
              ? 'Tap where the wall ends'
              : 'Drag where the wall goes, or tap its two ends'
            : mode === 'plug'
              ? 'Tap a wall to add a switchboard or plug point'
              : mode === 'cover'
                ? draft
                  ? 'Tap the opposite corner'
                  : 'Drag over the stair opening where the floor goes'
            : mode === 'zone'
              ? draft
                ? 'Tap the opposite corner'
                : `Drag across ${people.find((x) => x.id === (zonePerson ?? people[0]?.id))?.name ?? 'their'}'s space`
              : '';

  return (
    <div className="editor">
      {/* ---------- top bar ---------- */}
      <header className="editor-top">
        <button className="icon-btn" aria-label="Back to homes" onClick={() => navigate('/')}>
          <ArrowLeft size={22} />
        </button>
        <button className="editor-title" onClick={() => setSheet('layouts')} aria-label="Layouts and home name">
          <strong>{home.name}</strong>
          <span>
            {layout.name}
            {home.layouts.length > 1 ? ` · ${home.layouts.length} layouts` : ''} <ChevronDown size={13} />
          </span>
        </button>
        <button className="icon-btn" aria-label="Undo" disabled={!canUndo(layoutId)} onClick={undo}>
          <Undo2 size={20} />
        </button>
        <button className="icon-btn" aria-label="Redo" disabled={!canRedo(layoutId)} onClick={redo}>
          <Redo2 size={20} />
        </button>
        <span className="top-wide">
          <div className="segmented unit-toggle" role="group" aria-label="Units">
            <button aria-pressed={unit === 'ft'} onClick={() => S.setSettings({ unit: 'ft' })}>
              ft
            </button>
            <button aria-pressed={unit === 'm'} onClick={() => S.setSettings({ unit: 'm' })}>
              m
            </button>
          </div>
          {(
            <button className="btn btn-ghost top-btn" onClick={() => {
                setSheet(null);
                navigate(`/edit/${homeId}/${layoutId}/3d`);
              }}>
              <Box size={18} /> 3D
            </button>
          )}
          <button className="btn btn-ghost top-btn" onClick={() => setSheet('estimate')}>
            <Calculator size={18} /> Cost
          </button>
          <button className="btn btn-ghost top-btn" onClick={() => setSheet('share')}>
            <Share2 size={18} /> Share
          </button>
        </span>
        <button className="icon-btn" aria-label="More options" onClick={() => setSheet('more')}>
          <MoreHorizontal size={22} />
        </button>
        <ThemeToggle />
      </header>

      {/* ---------- floor tabs ---------- */}
      {multi && (
        <nav className="floor-tabs" aria-label="Floors">
          {layout.floors.map((f) => (
            <button
              key={f.id}
              className="floor-tab"
              aria-current={f.id === floor.id ? 'page' : undefined}
              onClick={() => (f.id === floor.id ? setSheet('floorMenu') : switchFloor(f.id))}
            >
              {f.name}
              {f.id === floor.id && <ChevronDown size={14} />}
            </button>
          ))}
          <button className="floor-tab add" aria-label="Add floor" onClick={() => setSheet('addFloorMenu')}>
            <Plus size={16} />
          </button>
          {floorBelow && (
            <button className={`floor-tab ghost-toggle${ghost ? ' on' : ''}`} aria-pressed={ghost} onClick={() => setGhost(!ghost)} title="Show floor below">
              <Eye size={15} /> Below
            </button>
          )}
        </nav>
      )}

      <div className="editor-body">
        {/* ---------- furniture panel (laptop / iPad) ---------- */}
        {wide && (
          <aside className="left-panel" aria-label="Furniture">
            <h3>Furniture</h3>
            <p className="hint" style={{ marginTop: -8 }}>Tap to add, or drag onto the plan.</p>
            <FurniturePanel
              multi={multi}
              unit={unit}
              templates={templates}
              onPick={(p) => addPickable(p)}
              onDrop={onDropTile}
              onCustom={() => setSheet('custom')}
              onDeleteTemplate={S.deleteTemplate}
              onMyThings={() => setSheet('mythings')}
            />
          </aside>
        )}

        {/* ---------- canvas ---------- */}
        <div className="canvas-area" ref={areaRef}>
          {view ? (
            <PlanCanvas
              view={view}
              setView={setView}
              onGestureEnd={persistView}
              onTap={onTap}
              onPointerDown={onPointerDown}
              onResize={onResize}
              cursor={mode === 'select' ? undefined : 'crosshair'}
              draw={{
                floor,
                floorBelow,
                ghostBelow: ghost,
                colors: PALETTES[theme],
                unit,
                showGrid: settings.showGrid,
                showDims: settings.showDims,
                selection: sel,
                warnings,
                measurements,
                measureDraft: mode === 'measure' ? draft : null,
                wallDraft: mode === 'wall' ? draft : null,
                coverDraft: mode === 'cover' ? draft : null,
                zoneDraft: mode === 'zone' && draft ? { ...draft, color: people.find((x) => x.id === (zonePerson ?? people[0]?.id))?.color ?? '#888' } : null,
                people,
                route,
                guides,
              }}
            />
          ) : (
            <Sizer onResize={onResize} />
          )}

          {settings.showGrid && (
            <div className="scale-chip" aria-hidden>
              <span className="scale-bar" style={{ width: Math.max(8, Math.min(80, scalePx)) }} />
              {scaleLabel}
            </div>
          )}

          {!wide && (
            <button className={`warn-badge ${redCount ? 'red' : warnings.list.length ? 'yellow' : 'ok'}`} onClick={() => setSheet('warnings')} aria-label={`${warnings.list.length} warnings`}>
              <AlertTriangle size={16} /> {warnings.list.length}
            </button>
          )}

          {mode !== 'select' && (
            <div className="mode-banner" role="status">
              <span>{modeText}</span>
              {mode === 'measure' && measurements.length > 0 && (
                <button className="btn btn-ghost" onClick={() => setMeasurements([])}>
                  Clear
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={() => {
                  setMode('select');
                  setDraft(null);
                }}
              >
                {mode === 'measure' ? 'Done' : 'Cancel'}
              </button>
            </div>
          )}
          {routeInfo && (
            <div className={`route-banner ${routeInfo.result.ok ? 'ok' : 'no'}`} role="status">
              <p>
                <strong>{routeInfo.result.ok ? '✓ ' : '✗ '}</strong>
                {routeInfo.result.message}
              </p>
              <div className="route-actions">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={routeInfo.furniture}
                    onChange={(e) => {
                      const it = floor.items.find((x) => x.id === routeInfo.itemId);
                      if (it) runRoute(it, e.target.checked);
                    }}
                  />
                  Other furniture is in the way
                </label>
                <button className="btn btn-primary" onClick={closeRoute}>
                  Close
                </button>
              </div>
            </div>
          )}
          {mode === 'select' && measurements.length > 0 && (
            <button className="btn clear-measure" onClick={() => setMeasurements([])}>
              <X size={16} /> Clear measurements
            </button>
          )}

          {actionBar && (
            <div className="action-bar" style={{ left: actionBar.left, top: actionBar.top }} role="toolbar" aria-label={`${selTitle} actions`}>
              {selItem && !selItem.locked && (
                <>
                  <button className="icon-btn" aria-label="Rotate left 90°" onClick={() => rotateBy(-90)}>
                    <RotateCcw size={19} />
                  </button>
                  <button className="icon-btn" aria-label="Rotate right 90°" onClick={() => rotateBy(90)}>
                    <RotateCw size={19} />
                  </button>
                </>
              )}
              {selItem && !selItem.locked && selSupport && !onTopAlready && (
                <button className="icon-btn" aria-label={`Put on top of ${selSupport.label}`} title={`Put on top of ${selSupport.label}`} onClick={() => stackSelected(selSupport)}>
                  <Layers size={19} />
                </button>
              )}
              {selItem && !selItem.locked && itemElevation(selItem) > 0 && (
                <button className="icon-btn" aria-label="Put on the floor" title="Put on the floor" onClick={() => edit((f) => ops.putOnFloor(f, selItem.id))}>
                  <ArrowDownToLine size={19} />
                </button>
              )}
              {selItem && itemMount(selItem) === 'floor' && !isStairs(selItem) && (
                <button className="icon-btn" aria-label="Will it get in?" title="Will it get in?" onClick={() => runRoute(selItem)}>
                  <Route size={19} />
                </button>
              )}
              {selItem && (
                <button className="icon-btn" aria-label="Duplicate" onClick={duplicate}>
                  <Copy size={19} />
                </button>
              )}
              {!wide && (
                <button className="icon-btn" aria-label={`Edit ${selTitle}`} onClick={() => setSheet('props')}>
                  <Pencil size={19} />
                </button>
              )}
              {(selItem || selOpening || selWall || selZone || selPoint || selCover || (selRoom && floor.rooms.length > 1)) && (
                <button className="icon-btn danger" aria-label="Delete" onClick={deleteSelected}>
                  <Trash2 size={19} />
                </button>
              )}
            </div>
          )}

          <div className="zoom-controls">
            <button className="icon-btn" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>
              <Minus size={20} />
            </button>
            <button className="icon-btn" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
              <Plus size={20} />
            </button>
            <button className="icon-btn" aria-label="Fit plan to screen" onClick={fit}>
              <Maximize size={19} />
            </button>
          </div>

          <div className="bottom-toolbar" role="toolbar" aria-label="Plan tools">
            {!wide && (
              <button className="tool-btn primary" onClick={() => setSheet('add')}>
                <Sofa size={20} />
                <span>Add</span>
              </button>
            )}
            <button className="tool-btn" onClick={() => setSheet('rooms')}>
              <SquarePlus size={20} />
              <span>Rooms</span>
            </button>
            <button className={`tool-btn${mode === 'door' ? ' on' : ''}`} aria-pressed={mode === 'door'} onClick={() => setMode(mode === 'door' ? 'select' : 'door')}>
              <DoorOpen size={20} />
              <span>Door</span>
            </button>
            <button className={`tool-btn${mode === 'window' ? ' on' : ''}`} aria-pressed={mode === 'window'} onClick={() => setMode(mode === 'window' ? 'select' : 'window')}>
              <AppWindow size={20} />
              <span>Window</span>
            </button>
            <button
              className={`tool-btn${mode === 'plug' ? ' on' : ''}`}
              aria-pressed={mode === 'plug'}
              onClick={() => {
                setMode(mode === 'plug' ? 'select' : 'plug');
                setSelection(null);
              }}
            >
              <Plug size={20} />
              <span>Plug</span>
            </button>
            <button
              className={`tool-btn${mode === 'wall' ? ' on' : ''}`}
              aria-pressed={mode === 'wall'}
              onClick={() => {
                setMode(mode === 'wall' ? 'select' : 'wall');
                setDraft(null);
                setSelection(null);
              }}
            >
              <BrickWall size={20} />
              <span>Wall</span>
            </button>
            <button
              className={`tool-btn${mode === 'measure' ? ' on' : ''}`}
              aria-pressed={mode === 'measure'}
              onClick={() => {
                setMode(mode === 'measure' ? 'select' : 'measure');
                setDraft(null);
                setSelection(null);
              }}
            >
              <Ruler size={20} />
              <span>Measure</span>
            </button>
          </div>
        </div>

        {/* ---------- properties + warnings (laptop / iPad) ---------- */}
        {wide && (
          <aside className="side-panel" aria-label="Properties">
            {sel ? (
              <>
                <div className="panel-head">
                  <h3>{selTitle}</h3>
                  <button className="icon-btn" aria-label="Close" onClick={() => setSelection(null)}>
                    <X size={18} />
                  </button>
                </div>
                {selectedPanel()}
              </>
            ) : (
              <div className="empty-props">
                <h3>{multi ? floor.name : 'Plan'}</h3>
                <p className="hint">Tap furniture, a room, a door or a window to change it.</p>
                <p className="hint">
                  {floor.rooms.length} room{floor.rooms.length === 1 ? '' : 's'} · {floor.items.length} item{floor.items.length === 1 ? '' : 's'}
                </p>
              </div>
            )}
            <div className="warn-section">
              <h3>
                Warnings {warnings.list.length > 0 && <span className={`count ${redCount ? 'red' : 'yellow'}`}>{warnings.list.length}</span>}
              </h3>
              <WarningsPanel warnings={warnings.list} ignored={warnings.ignored} onPick={pickWarning} onFix={applyFix} onLetItBe={letItBe} />
            </div>
          </aside>
        )}
      </div>

      {/* ---------- sheets & dialogs ---------- */}
      {sheet === 'add' && (
        <Dialog title="Add furniture" subtitle="Tap an item to put it on the plan." onClose={() => setSheet(null)}>
          <FurniturePanel multi={multi} unit={unit} templates={templates} onPick={(p) => addPickable(p)} onCustom={() => setSheet('custom')} onDeleteTemplate={S.deleteTemplate} onMyThings={() => setSheet('mythings')} />
        </Dialog>
      )}
      {sheet === 'props' && sel && (
        <Dialog title={selTitle} onClose={() => setSheet(null)}>
          {selectedPanel()}
          <div className="dialog-actions">
            <button className="btn btn-primary" onClick={() => setSheet(null)}>
              Done
            </button>
          </div>
        </Dialog>
      )}
      {sheet === 'warnings' && (
        <Dialog title="Warnings" subtitle="Tap a warning to see it on the plan." onClose={() => setSheet(null)}>
          <WarningsPanel warnings={warnings.list} ignored={warnings.ignored} onPick={pickWarning} onFix={applyFix} onLetItBe={letItBe} />
        </Dialog>
      )}
      {sheet === 'rooms' && (
        <Dialog title={multi ? `Rooms on ${floor.name}` : 'Rooms'} onClose={() => setSheet(null)}>
          <div className="action-list">
            {byDepth(floor).map(({ room: r, depth }) => (
              <button
                key={r.id}
                className="action-item"
                style={{ paddingLeft: 12 + depth * 22 }}
                onClick={() => {
                  setSelection({ kind: 'room', id: r.id });
                  setSheet(wide ? null : 'props');
                }}
              >
                <Pencil size={18} /> {r.name}
                <span className="hint" style={{ marginLeft: 'auto' }}>
                  {ROOM_KINDS.find((k) => k.kind === kindOf(r))?.label} · {formatLength(r.width, unit)} × {formatLength(r.length, unit)}
                </span>
              </button>
            ))}
          </div>
          <div className="stack-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => setSheet('addRoom')}>
              <Plus size={17} /> Add room, bathroom, balcony…
            </button>
            <button className="btn" onClick={() => setSheet('hall')}>
              <SquareDashed size={17} /> Add hall / lobby (whole home size)
            </button>
            {stairOpenings(floorBelow).length > 0 && (
              <button
                className="btn"
                onClick={() => {
                  setSheet(null);
                  setSelection(null);
                  setDraft(null);
                  setMode('cover');
                }}
              >
                <Footprints size={17} /> Add floor over the stairs
              </button>
            )}
            {multi ? (
              <button className="btn btn-ghost" onClick={addBasementFloor}>
                <Car size={17} /> Add basement / parking floor
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={() => setSheet('makeMulti')}>
                <Layers size={17} /> Add a floor or basement
              </button>
            )}
          </div>
        </Dialog>
      )}
      {sheet === 'addRoom' && (
        <AddRoomDialog
          floor={floor}
          unit={unit}
          defaultAttach={selRoom?.id}
          onClose={() => setSheet(null)}
          onAdd={(v) => {
            let rid = '';
            edit((f) => {
              if (v.mode === 'inside') {
                const r = ops.placeInside(f, v.parentId, v.name, v.kind, v.width, v.length, v.corner);
                if ('error' in r) {
                  toast(r.error);
                  return f;
                }
                rid = r.roomId;
                return r.floor;
              }
              const r = ops.attachRoom(f, v.name, v.width, v.length, v.toId, v.side, v.align, v.gap, v.kind);
              rid = r.roomId;
              return { ...r.floor, innerWallMm: v.gap };
            });
            if (rid) setSelection({ kind: 'room', id: rid });
            setTimeout(fit, 30);
          }}
        />
      )}
      {sheet === 'hall' && (
        <HallDialog
          floor={floor}
          unit={unit}
          onClose={() => setSheet(null)}
          onAdd={(v) => {
            const r = ops.hallAround(floor, v.name, v.width, v.length);
            if ('error' in r) return `Too small. Your rooms need at least ${formatLength(r.needW, unit)} × ${formatLength(r.needL, unit)}.`;
            edit(() => r.floor);
            setSelection({ kind: 'room', id: r.roomId });
            setTimeout(fit, 30);
            toast('Hall added. The space around your rooms is the hall.');
            return null;
          }}
        />
      )}
      {sheet === 'makeMulti' && (
        <Dialog title="Add a floor or basement" subtitle="This home becomes a multi-floor home with floor tabs. The 3D view shows all floors stacked." onClose={() => setSheet(null)}>
          <div className="stack-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                S.setHomeKind(homeId, 'multi');
                if (layout.floors.length === 1 && layout.floors[0].name === 'Floor') S.editLayout(homeId, layoutId, (l) => ops.renameFloor(l, l.floors[0].id, 'Ground Floor'));
                addBasementFloor();
              }}
            >
              <Car size={17} /> Add basement / parking below
            </button>
            <button
              className="btn"
              onClick={() => {
                S.setHomeKind(homeId, 'multi');
                if (layout.floors.length === 1 && layout.floors[0].name === 'Floor') S.editLayout(homeId, layoutId, (l) => ops.renameFloor(l, l.floors[0].id, 'Ground Floor'));
                addFloorAbove();
              }}
            >
              <Layers size={17} /> Add a floor above
            </button>
          </div>
        </Dialog>
      )}
      {sheet === 'addFloorMenu' && (
        <Dialog title="Add floor" onClose={() => setSheet(null)}>
          <div className="action-list">
            <button className="action-item" onClick={addFloorAbove}>
              <Layers size={18} /> Floor above (same rooms as the top floor)
            </button>
            <button className="action-item" onClick={addBasementFloor}>
              <Car size={18} /> Basement / underground parking below
            </button>
          </div>
        </Dialog>
      )}
      {sheet === 'deleteRoom' && selRoom && (
        <ConfirmDialog
          title={`Delete "${selRoom.name}"?`}
          message="The room, its doors and windows and the furniture standing in it will be removed. Rooms inside it stay."
          confirmLabel="Delete room"
          danger
          onConfirm={() => {
            edit((f) => ops.deleteRoom(f, selRoom.id));
            setSelection(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'custom' && (
        <CustomItemDialog
          unit={unit}
          heights={heights}
          onClose={() => setSheet(null)}
          onAdd={(v) => {
            const t = { id: newId(), type: 'custom', label: v.label, width: v.width, depth: v.depth, heightMm: v.heightMm, shape: v.shape, color: v.color };
            if (v.save) S.addTemplate(t);
            addPickable({ kind: 'template', t });
          }}
        />
      )}
      {sheet === 'layouts' && (
        <LayoutsDialog
          home={home}
          currentId={layoutId}
          onSwitch={switchLayout}
          onAdd={(m) => {
            const nid = S.addLayout(homeId, layoutId, m);
            if (nid) {
              toast(m === 'blank' ? 'New empty layout' : 'Layout copied');
              switchLayout(nid);
            }
          }}
          onRename={(id, n) => S.renameLayout(homeId, id, n)}
          onDelete={(id) => {
            const other = home.layouts.find((l) => l.id !== id);
            S.deleteLayout(homeId, id);
            if (id === layoutId && other) switchLayout(other.id);
          }}
          onRenameHome={(n) => S.renameHome(homeId, n)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'floorMenu' && (
        <FloorMenu
          floor={floor}
          unit={unit}
          canDelete={layout.floors.length > 1}
          onRename={(n) => S.editLayout(homeId, layoutId, (l) => ops.renameFloor(l, floor.id, n))}
          onFloorHeight={(mm) => S.editLayout(homeId, layoutId, (l) => ({ ...l, floors: l.floors.map((f) => (f.id === floor.id ? { ...f, floorHeightMm: mm } : f)) }))}
          onDelete={() => {
            const next = layout.floors[floorIndex > 0 ? floorIndex - 1 : 1];
            S.editLayout(homeId, layoutId, (l) => ops.deleteFloor(l, floor.id));
            if (next) switchFloor(next.id);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'share' && (
        <ShareDialog
          home={home}
          layoutId={layoutId}
          onBackup={() => {
            downloadBackup(home);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'export' && <ExportDialog home={home} layout={layout} floorId={floor.id} unit={unit} showDims={settings.showDims} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <SettingsDialog onClose={() => setSheet(null)} />}
      {sheet === 'roommates' && (
        <RoommatesDialog
          home={home}
          floor={floor}
          onPeople={(people, meId) =>
            S.patchHome(homeId, (h) => {
              const next = { ...h, people };
              if (meId === null) delete next.meId;
              else if (meId) next.meId = meId;
              return next;
            })
          }
          onDrawSpace={(pid) => {
            setZonePerson(pid);
            setSelection(null);
            setDraft(null);
            setMode('zone');
            setSheet(null);
          }}
          onShare={() => setSheet('share')}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'mythings' && (
        <MyThingsDialog
          templates={templates}
          homes={allHomes}
          homeId={homeId}
          floors={layout.floors}
          floorIndex={floorIndex}
          unit={unit}
          onCount={(id, count) => S.updateTemplate(id, { count })}
          onDelete={S.deleteTemplate}
          onOpenHome={(id) => {
            setSheet(null);
            const h = allHomes.find((x) => x.id === id);
            if (h && id !== homeId) navigate(`/edit/${id}/${h.layouts[0].id}`);
          }}
          onPlace={(placed, missing, already) => {
            const byId = new Map(templates.map((t) => [t.id, t]));
            const items: Item[] = placed.flatMap((p) => {
              const t = byId.get(p.thing.key.split('#')[0]);
              if (!t) return [];
              return [
                {
                  id: newId(),
                  type: t.type || 'custom',
                  label: t.label,
                  x: p.x,
                  y: p.y,
                  width: t.width,
                  depth: t.depth,
                  rotation: p.rotation,
                  shape: t.shape,
                  color: t.color,
                  ...(t.heightMm ? { heightMm: t.heightMm } : {}),
                  ...(home.meId ? { owner: home.meId } : {}),
                },
              ];
            });
            if (items.length) edit((f) => items.reduce((acc, it) => ops.addItem(acc, it), f));
            setSheet(null);
            const names = [...new Set(missing.map((m) => m.label))];
            toast(
              (items.length ? `Placed ${items.length} thing${items.length === 1 ? '' : 's'}.` : 'Nothing new to place.') +
                (already ? ` ${already} already here.` : '') +
                (names.length ? ` No room for: ${names.join(', ')}.` : ''),
            );
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'estimate' && (
        <EstimateDialog layout={layout} unit={unit} multi={multi} onChange={(estimate) => S.editLayout(homeId, layoutId, (l) => ({ ...l, estimate }))} onClose={() => setSheet(null)} />
      )}
      {sheet === 'account' && <AccountDialog onClose={() => setSheet(null)} />}
      {sheet === 'more' && (
        <Dialog title="More" onClose={() => setSheet(null)}>
          <div className="field">
            <span className="field-label">Units</span>
            <div className="segmented" role="group" aria-label="Units">
              <button aria-pressed={unit === 'ft'} onClick={() => S.setSettings({ unit: 'ft' })}>
                Feet
              </button>
              <button aria-pressed={unit === 'm'} onClick={() => S.setSettings({ unit: 'm' })}>
                Meters
              </button>
            </div>
          </div>
          <div className="action-list">
            <button className="action-item" onClick={() => setSheet('share')}>
              <Share2 size={18} /> Share link
            </button>
            <button className="action-item" onClick={() => setSheet('estimate')}>
              <Calculator size={18} /> Building cost
            </button>
            <button className="action-item" onClick={() => setSheet('mythings')}>
              <PackageOpen size={18} /> My things (for any home)
            </button>
            <button className="action-item" onClick={() => setSheet('roommates')}>
              <Users size={18} /> Roommates
            </button>
            <button className="action-item" onClick={() => setSheet('export')}>
              <ImageIcon size={18} /> Save as image (PNG)
            </button>
            <button
              className="action-item"
              onClick={() => {
                downloadBackup(home);
                setSheet(null);
              }}
            >
              <FileDown size={18} /> Download backup of this home
            </button>
            {(
              <button className="action-item" onClick={() => {
                setSheet(null);
                navigate(`/edit/${homeId}/${layoutId}/3d`);
              }}>
                <Box size={18} /> 3D view
              </button>
            )}
            <button className="action-item" onClick={() => S.setSettings({ showGrid: !settings.showGrid })}>
              <Grid3x3 size={18} /> {settings.showGrid ? 'Hide grid' : 'Show grid'}
            </button>
            <button className="action-item" onClick={() => S.setSettings({ showDims: !settings.showDims })}>
              <Ruler size={18} /> {settings.showDims ? 'Hide sizes' : 'Show sizes'}
            </button>
            {multi && floorBelow && (
              <button className="action-item" onClick={() => setGhost(!ghost)}>
                <Layers size={18} /> {ghost ? 'Hide floor below' : 'Show floor below'}
              </button>
            )}
            <button className="action-item" onClick={() => setSheet('settings')}>
              <SettingsIcon size={18} /> Settings & backup
            </button>
            <button className="action-item" onClick={() => setSheet('account')}>
              <UserRound size={18} /> Account ({useAuth.getState().user?.name ?? ''})
            </button>
            <button
              className="action-item"
              onClick={() => {
                setSheet(null);
                navigate('/help');
              }}
            >
              <HelpCircle size={18} /> Help
            </button>
          </div>
        </Dialog>
      )}

      {show3d && (
        <Suspense fallback={<div className="three-loading">Loading 3D…</div>}>
          <View3D
            floors={layout.floors}
            startIndex={floorIndex}
            multi={multi}
            homeName={home.name}
            layoutName={layout.name}
            unit={unit}
            settings={settings}
            templates={templates}
            onAddItem={(fi, item) => S.editLayout(homeId, layoutId, (l) => ({ ...l, floors: l.floors.map((f, i) => (i === fi ? ops.addItem(f, home.meId ? { ...item, owner: home.meId } : item) : f)) }))}
            onUpdateItem={(fi, id, patch, live) =>
              S.editLayout(homeId, layoutId, (l) => ({ ...l, floors: l.floors.map((f, i) => (i === fi ? ops.updateItem(f, id, patch) : f)) }), live ? { history: false } : undefined)
            }
            onDragStart={() => S.checkpoint(homeId, layoutId)}
            onDeleteItem={(fi, id) => S.editLayout(homeId, layoutId, (l) => ({ ...l, floors: l.floors.map((f, i) => (i === fi ? ops.deleteItem(f, id) : f)) }))}
            onClose={() => navigate(`/edit/${homeId}/${layoutId}`, true)}
          />
        </Suspense>
      )}
    </div>
  );
}

function Sizer({ onResize }: { onResize: (w: number, h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) onResize(el.clientWidth, el.clientHeight);
  }, [onResize]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}
