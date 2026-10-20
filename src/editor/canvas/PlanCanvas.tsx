import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LayoutView } from '../../model/types';
import { drawPlan, type DrawState } from './draw';
import { useCanvasGestures, type DragSession } from '../gestures/useCanvasGestures';
import './PlanCanvas.css';

// 3x phone screens don't need 3x canvas pixels; 2x stays sharp and is much faster.
const DPR_CAP = 2;

export interface PlanCanvasProps {
  draw: Omit<DrawState, 'width' | 'height' | 'view'>;
  view: LayoutView;
  setView: (v: LayoutView) => void;
  onGestureEnd?: () => void;
  onTap?: (sx: number, sy: number) => void;
  onPointerDown?: (sx: number, sy: number, pointerType: string) => DragSession | null;
  onResize?: (w: number, h: number) => void;
  cursor?: string;
  children?: React.ReactNode;
}

export function PlanCanvas(props: PlanCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const viewRef = useRef(props.view);
  viewRef.current = props.view;

  useCanvasGestures(wrapRef, {
    getView: () => viewRef.current,
    setView: props.setView,
    onTap: props.onTap,
    onPointerDown: props.onPointerDown,
    onGestureEnd: props.onGestureEnd,
  });

  const onResizeRef = useRef(props.onResize);
  onResizeRef.current = props.onResize;
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
      onResizeRef.current?.(w, h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Redraw on the next frame whenever anything changes.
  const stateRef = useRef<DrawState | null>(null);
  stateRef.current = size.w && size.h ? { ...props.draw, view: props.view, width: size.w, height: size.h } : null;
  const rafRef = useRef(0);
  useEffect(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const canvas = canvasRef.current;
      const st = stateRef.current;
      if (!canvas || !st) return;
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const W = Math.round(st.width * dpr);
      const H = Math.round(st.height * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPlan(ctx, st);
    });
  });
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0; // so the next mount can schedule a redraw again
    },
    [],
  );

  return (
    <div ref={wrapRef} className="plan-canvas" data-testid="plan-canvas" style={{ cursor: props.cursor }}>
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} aria-label="Floor plan" role="img" />
      {props.children}
    </div>
  );
}
