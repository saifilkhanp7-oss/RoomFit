import { useEffect, useRef } from 'react';
import type { LayoutView } from '../../model/types';
import { clampZoom, zoomAt } from '../../geometry/view';

export interface DragSession {
  /** Called on every move once the pointer has moved past the tap slop. */
  move: (sx: number, sy: number) => void;
  /** Called when the drag finishes (or is interrupted by a second finger). */
  end: (moved: boolean) => void;
}

interface Options {
  getView: () => LayoutView;
  setView: (v: LayoutView) => void;
  /** Return a session to drag something (item, room, rotation handle…), or null to pan. */
  onPointerDown?: (sx: number, sy: number, pointerType: string) => DragSession | null;
  onTap?: (sx: number, sy: number) => void;
  onGestureEnd?: () => void;
  onHover?: (sx: number, sy: number) => void;
}

/**
 * All pointer handling for the plan, using Pointer Events so finger (iPhone/iPad/Android),
 * mouse and pen behave the same:
 *
 *  - 1 finger / mouse on furniture → drag it (session from onPointerDown)
 *  - 1 finger / mouse on empty space → pan
 *  - 2 fingers → pinch zoom + move (cancels any drag)
 *  - quick tap → onTap (select)
 *  - mouse wheel → zoom at cursor; trackpad scroll → pan; trackpad pinch → zoom
 *
 * The element has `touch-action: none`, and Safari's own pinch "gesture" events are blocked,
 * so the page itself never scrolls or zooms while planning.
 */
export function useCanvasGestures(ref: React.RefObject<HTMLElement | null>, opts: Options) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let single: {
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      t: number;
      moved: boolean;
      slop: number;
      session: DragSession | null;
    } | null = null;
    let pinch: { dist: number; midX: number; midY: number; view: LayoutView } | null = null;
    let viewChanged = false;

    let raf = 0;
    let pendingView: LayoutView | null = null;
    const pushView = (v: LayoutView) => {
      pendingView = v;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (pendingView) optsRef.current.setView(pendingView);
          pendingView = null;
        });
      }
    };
    const currentView = () => pendingView ?? optsRef.current.getView();
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const endSession = () => {
      if (single?.session) {
        single.session.end(single.moved);
        single.session = null;
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      el.setPointerCapture?.(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        const session = e.button === 1 ? null : optsRef.current.onPointerDown?.(p.x, p.y, e.pointerType) ?? null;
        single = {
          startX: p.x,
          startY: p.y,
          lastX: p.x,
          lastY: p.y,
          t: performance.now(),
          moved: false,
          slop: e.pointerType === 'mouse' ? 3 : 8,
          session,
        };
      } else if (pointers.size === 2) {
        // second finger: stop dragging furniture, start pinch
        if (single) {
          endSession();
          single.moved = true;
        }
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, view: currentView() };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') {
          const p = local(e);
          optsRef.current.onHover?.(p.x, p.y);
        }
        return;
      }
      const p = local(e);
      pointers.set(e.pointerId, p);

      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const v0 = pinch.view;
        const zoom = clampZoom(v0.zoom * (dist / pinch.dist));
        const wx = (pinch.midX - v0.panX) / v0.zoom;
        const wy = (pinch.midY - v0.panY) / v0.zoom;
        pushView({ ...v0, zoom, panX: midX - wx * zoom, panY: midY - wy * zoom });
        viewChanged = true;
        return;
      }

      if (single && pointers.size === 1) {
        if (!single.moved && Math.hypot(p.x - single.startX, p.y - single.startY) > single.slop) single.moved = true;
        if (!single.moved) return;
        if (single.session) {
          single.session.move(p.x, p.y);
        } else {
          const v = currentView();
          pushView({ ...v, panX: v.panX + (p.x - single.lastX), panY: v.panY + (p.y - single.lastY) });
          viewChanged = true;
        }
        single.lastX = p.x;
        single.lastY = p.y;
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.delete(e.pointerId);

      if (pointers.size === 1) {
        const [rest] = [...pointers.values()];
        single = { startX: rest.x, startY: rest.y, lastX: rest.x, lastY: rest.y, t: 0, moved: true, slop: 8, session: null };
        pinch = null;
        return;
      }
      if (pointers.size === 0) {
        const tapped = e.type === 'pointerup' && single && !single.moved && performance.now() - single.t < 600;
        endSession();
        if (tapped) optsRef.current.onTap?.(p.x, p.y);
        single = null;
        pinch = null;
        if (viewChanged) {
          viewChanged = false;
          requestAnimationFrame(() => optsRef.current.onGestureEnd?.());
        }
      }
    };

    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const v = currentView();
      const lineMode = e.deltaMode === 1;
      const dy = lineMode ? e.deltaY * 16 : e.deltaY;
      const dx = lineMode ? e.deltaX * 16 : e.deltaX;
      const trackpadScroll = !e.ctrlKey && !lineMode && (dx !== 0 || (Math.abs(dy) < 40 && !Number.isInteger(dy)));
      if (trackpadScroll) pushView({ ...v, panX: v.panX - dx, panY: v.panY - dy });
      else pushView(zoomAt(v, v.zoom * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y));
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => optsRef.current.onGestureEnd?.(), 250);
    };

    const prevent = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', prevent);
    el.addEventListener('gesturechange', prevent);
    el.addEventListener('gestureend', prevent);
    el.addEventListener('touchmove', prevent, { passive: false });
    el.addEventListener('contextmenu', prevent);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', prevent);
      el.removeEventListener('gesturechange', prevent);
      el.removeEventListener('gestureend', prevent);
      el.removeEventListener('touchmove', prevent);
      el.removeEventListener('contextmenu', prevent);
      if (raf) cancelAnimationFrame(raf);
      if (wheelTimer) clearTimeout(wheelTimer);
    };
  }, [ref]);
}
