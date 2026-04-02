/**
 * useCanvasInteraction.js — Task 1: The Flawless Canvas Interaction Engine
 * =========================================================================
 * A custom React hook that handles all pointer input on the canvas.
 *
 * Design Principles:
 *   1. Uses onPointerDown / onPointerMove / onPointerUp (Pointer Events API)
 *      instead of separate mouse + touch handlers. This single unified path
 *      correctly handles mouse, trackpad taps, stylus pens, and touch fingers.
 *
 *   2. Coordinate Normalization:
 *      The canvas has an internal logical resolution (e.g. 800×600) but may
 *      be displayed at any CSS size. getBoundingClientRect() returns the
 *      rendered CSS size. We scale:
 *
 *        x_logical = (e.clientX - rect.left)  * (canvas.width  / rect.width )
 *        y_logical = (e.clientY - rect.top)   * (canvas.height / rect.height)
 *
 *      This means a click at the rendered top-left is ALWAYS (0, 0) in canvas
 *      space, regardless of scroll position, device pixel ratio, or CSS transforms.
 *
 *   3. Pointer Capture: canvas.setPointerCapture(e.pointerId) locks the
 *      pointer to the canvas so dragging never "loses" the element even if
 *      the cursor moves outside the canvas bounds at high speed.
 *
 *   4. Obstacle Painting with Gap-Filling:
 *      Fast mouse/finger movement can skip many pixels between consecutive
 *      onPointerMove events. We detect the gap and linearly interpolate
 *      intermediate points so the painted trail is always continuous.
 *
 * @param {object} params
 * @param {React.RefObject} params.canvasRef        — ref to the <canvas>
 * @param {function} params.onStartChange           — called with new {x,y} normalized [0,1]
 * @param {function} params.onGoalChange            — called with new {x,y} normalized [0,1]
 * @param {function} params.onObstaclesChange       — called with full obstacles array
 */

import { useRef, useCallback } from "react";

// ── Hit-test radius in LOGICAL canvas pixels ──────────────────────────────────
const HIT_RADIUS = 18;

// ── Obstacle brush: how many logical pixels between painted dots ──────────────
const BRUSH_SPACING = 8;

// ── Obstacle brush radius (in normalized [0,1] coords) ────────────────────────
const OBSTACLE_RADIUS_NORM = 0.012;

export function useCanvasInteraction({
  canvasRef,
  onStartChange,
  onGoalChange,
  onObstaclesChange,
}) {
  // Interaction state — stored in a ref, NOT React state, to avoid re-renders
  // during high-frequency pointer events. Only canvas drawing triggers rerenders.
  const interactionRef = useRef({
    mode: "none",    // "none" | "drag-start" | "drag-goal" | "paint"
    prevLogical: null, // {x, y} — previous logical position for gap-fill interpolation
  });

  // Live obstacle list ref — mutated directly for performance
  const obstaclesRef = useRef([]);

  // Marker positions in normalized [0, 1] coordinates
  const startRef = useRef({ x: 0.1, y: 0.5 });
  const goalRef  = useRef({ x: 0.9, y: 0.5 });

  // ── Coordinate Utilities ─────────────────────────────────────────────────────

  /**
   * normalizeToLogical
   * Converts a PointerEvent's client position to the canvas's internal logical
   * coordinates. This is THE critical function for perfect click accuracy.
   *
   * Steps:
   *   a) Get the canvas's position/size on screen via getBoundingClientRect()
   *   b) Subtract the canvas corner to get position relative to canvas element
   *   c) Scale by the ratio (logical size / CSS size) to account for any CSS scaling
   */
  const normalizeToLogical = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { lx: 0, ly: 0, nx: 0, ny: 0 };

    // Step a & b: pointer position relative to the rendered canvas corner
    const rect = canvas.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    // Step c: scale to internal canvas resolution (handles CSS zoom/DPR)
    const lx = relX * (canvas.width  / rect.width);
    const ly = relY * (canvas.height / rect.height);

    // Also return normalized [0, 1] coordinates for the APF engine
    const nx = lx / canvas.width;
    const ny = ly / canvas.height;

    return { lx, ly, nx, ny };
  }, [canvasRef]);

  /**
   * Converts a normalized [0,1] position to logical canvas pixels.
   * Used for hit-testing markers.
   */
  const normToLogical = useCallback((nx, ny) => {
    const canvas = canvasRef.current;
    if (!canvas) return { lx: 0, ly: 0 };
    return { lx: nx * canvas.width, ly: ny * canvas.height };
  }, [canvasRef]);

  // ── Obstacle Painting ─────────────────────────────────────────────────────────

  /**
   * paintAt — adds an obstacle at normalized position (nx, ny).
   * Skips if too close to start or goal to avoid trapping the planner.
   */
  const paintAt = useCallback((nx, ny) => {
    const tooCloseToStart = Math.hypot(nx - startRef.current.x, ny - startRef.current.y) < 0.06;
    const tooCloseToGoal  = Math.hypot(nx - goalRef.current.x,  ny - goalRef.current.y)  < 0.06;
    if (tooCloseToStart || tooCloseToGoal) return;

    obstaclesRef.current = [...obstaclesRef.current, [nx, ny]];
    onObstaclesChange(obstaclesRef.current);
  }, [onObstaclesChange]);

  /**
   * interpolateAndPaint — fills any gap between prevLogical and currLogical
   * by placing obstacle dots at every BRUSH_SPACING pixels along the line.
   * This is a Bresenham-inspired linear interpolation:
   *   P(t) = prevLogical + t · (curr − prev),  t ∈ [0, 1]
   */
  const interpolateAndPaint = useCallback((prev, curr, nx, ny) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dx = curr.lx - prev.lx;
    const dy = curr.ly - prev.ly;
    const dist = Math.hypot(dx, dy);

    if (dist < BRUSH_SPACING) {
      // Close enough — just paint the current point
      paintAt(nx, ny);
      return;
    }

    // How many intermediate steps do we need?
    const steps = Math.ceil(dist / BRUSH_SPACING);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Interpolate in logical space then convert to normalized
      const interpLx = prev.lx + t * dx;
      const interpLy = prev.ly + t * dy;
      const interpNx = interpLx / canvas.width;
      const interpNy = interpLy / canvas.height;
      paintAt(interpNx, interpNy);
    }
  }, [canvasRef, paintAt]);

  // ── Event Handlers ────────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Lock pointer to canvas so fast drags don't lose the element
    canvas.setPointerCapture(e.pointerId);

    const { lx, ly, nx, ny } = normalizeToLogical(e);

    // Convert start/goal markers to logical pixels for hit-testing
    const sLog = normToLogical(startRef.current.x, startRef.current.y);
    const gLog = normToLogical(goalRef.current.x,  goalRef.current.y);

    const hitStart = Math.hypot(lx - sLog.lx, ly - sLog.ly) < HIT_RADIUS;
    const hitGoal  = Math.hypot(lx - gLog.lx, ly - gLog.ly) < HIT_RADIUS;

    if (hitStart) {
      // ── Mode: drag the Start marker ──────────────────────────────────────
      interactionRef.current.mode = "drag-start";
    } else if (hitGoal) {
      // ── Mode: drag the Goal marker ───────────────────────────────────────
      interactionRef.current.mode = "drag-goal";
    } else {
      // ── Mode: paint obstacles ─────────────────────────────────────────────
      interactionRef.current.mode = "paint";
      interactionRef.current.prevLogical = { lx, ly };
      paintAt(nx, ny);
    }
  }, [canvasRef, normalizeToLogical, normToLogical, paintAt]);


  const handlePointerMove = useCallback((e) => {
    const { mode } = interactionRef.current;
    if (mode === "none") return;

    const { lx, ly, nx, ny } = normalizeToLogical(e);

    if (mode === "drag-start") {
      // Clamp to canvas bounds
      const cx = Math.max(0, Math.min(1, nx));
      const cy = Math.max(0, Math.min(1, ny));
      startRef.current = { x: cx, y: cy };
      onStartChange([cx, cy]);

    } else if (mode === "drag-goal") {
      const cx = Math.max(0, Math.min(1, nx));
      const cy = Math.max(0, Math.min(1, ny));
      goalRef.current = { x: cx, y: cy };
      onGoalChange([cx, cy]);

    } else if (mode === "paint") {
      // ── Gap-fill interpolation ────────────────────────────────────────────
      const prev = interactionRef.current.prevLogical;
      if (prev) {
        interpolateAndPaint(prev, { lx, ly }, nx, ny);
      }
      interactionRef.current.prevLogical = { lx, ly };
    }
  }, [normalizeToLogical, onStartChange, onGoalChange, interpolateAndPaint]);


  const handlePointerUp = useCallback(() => {
    interactionRef.current.mode = "none";
    interactionRef.current.prevLogical = null;
  }, []);


  const clearObstacles = useCallback(() => {
    obstaclesRef.current = [];
    onObstaclesChange([]);
  }, [onObstaclesChange]);

  // ── Expose to component ───────────────────────────────────────────────────────
  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearObstacles,
    startRef,
    goalRef,
    obstaclesRef,
  };
}
