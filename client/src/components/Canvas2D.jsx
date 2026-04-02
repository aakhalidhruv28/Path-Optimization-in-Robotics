/**
 * Canvas2D.jsx — High-Performance 2D Sandbox Canvas
 * ===================================================
 * Root cause of black screen fix:
 *   The original code set canvas.width = CANVAS_W * dpr, which resets the
 *   canvas context transform. Then ctx.scale(dpr, dpr) was called once — but
 *   on every new animation frame, getContext("2d") returned the same ctx with
 *   the dpr scale still applied, making renderFrame draw outside the visible
 *   area. Fix: use a fixed logical 800×600 buffer and let CSS scale it.
 *
 * Interaction model: Unified Pointer Events → useCanvasInteraction hook.
 */

import { useEffect, useRef, useCallback } from "react";
import { useCanvasInteraction } from "../hooks/useCanvasInteraction";
import { renderFrame } from "../utils/canvasRenderer";

// Fixed logical resolution — CSS handles display scaling
const CANVAS_W = 800;
const CANVAS_H = 600;

export default function Canvas2D({ path, onStartChange, onGoalChange, onObstaclesChange }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const pulseRef  = useRef(0); // for marker pulse animation

  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearObstacles,
    startRef,
    goalRef,
    obstaclesRef,
  } = useCanvasInteraction({ canvasRef, onStartChange, onGoalChange, onObstaclesChange });

  // ── One-time canvas size setup ────────────────────────────────────────────
  // IMPORTANT: Setting canvas.width RESETS the context (including transforms).
  // Do this ONCE on mount with the plain logical size — no DPR multiplication.
  // CSS width:100% handles visual scaling without corrupting ctx state.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = CANVAS_W;
    canvas.height = CANVAS_H;
  }, []); // empty deps = runs once after mount

  // ── Animation loop using refs — never stale ───────────────────────────────
  // We store path in a ref so animate() doesn't need to be recreated on
  // every WebSocket tick, avoiding unnecessary RAF cancel/restart cycles.
  const pathRef = useRef(path);
  useEffect(() => { pathRef.current = path; }, [path]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(animate); return; }

    const ctx = canvas.getContext("2d");

    // Advance pulse timer (0 → 2π loop)
    pulseRef.current = (pulseRef.current + 0.025) % (Math.PI * 2);

    renderFrame(ctx, CANVAS_W, CANVAS_H, {
      obstacles: obstaclesRef.current,
      path:      pathRef.current,
      start:     startRef.current,
      goal:      goalRef.current,
      pulse:     Math.sin(pulseRef.current) > 0,
    });

    rafRef.current = requestAnimationFrame(animate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable ref — never recreated

  // Start animation once on mount, cancel on unmount
  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  // ── Block touch-scroll on canvas so painting works on mobile ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevent = (e) => e.preventDefault();
    canvas.addEventListener("touchstart", prevent, { passive: false });
    canvas.addEventListener("touchmove",  prevent, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", prevent);
      canvas.removeEventListener("touchmove",  prevent);
    };
  }, []);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        id="apf-sandbox"
        aria-label="APF Navigation Sandbox"
        style={{
          width: "100%",        /* CSS scales the logical 800×600 buffer */
          height: "auto",       /* aspect ratio preserved automatically   */
          display: "block",
          cursor: "crosshair",
          borderRadius: "12px",
          touchAction: "none",
          background: "#0D1117",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* Legend */}
      <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", gap: 8 }}>
        {[
          { color: "#00FF9F", label: "Start", shape: "circle" },
          { color: "#FFD700", label: "Goal",  shape: "square" },
          { color: "#FF6B35", label: "Obstacle", shape: "circle" },
          { color: "#00D4FF", label: "Path",  shape: "line" },
        ].map(({ color, label, shape }) => (
          <span key={label} style={{
            display: "flex", alignItems: "center", gap: 5, fontSize: 11,
            fontFamily: "monospace", color: "#8B949E",
            background: "rgba(22,27,34,0.85)", backdropFilter: "blur(4px)",
            border: "1px solid #21262D", borderRadius: 6, padding: "3px 8px",
          }}>
            {shape === "line"
              ? <span style={{ width: 20, height: 2, background: color, display: "inline-block", borderRadius: 2 }} />
              : <span style={{ width: 10, height: 10, background: color, display: "inline-block",
                               borderRadius: shape === "circle" ? "50%" : 2,
                               transform: shape === "square" ? "rotate(45deg)" : "none" }} />
            }
            {label}
          </span>
        ))}
      </div>

      {/* Clear button */}
      <button
        id="clear-obstacles-btn"
        onClick={clearObstacles}
        style={{
          position: "absolute", top: 12, right: 12, fontSize: 11,
          fontFamily: "monospace", padding: "5px 12px", borderRadius: 6,
          background: "#0D1117", border: "1px solid #21262D", color: "#8B949E",
          cursor: "pointer", transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.target.style.color = "#fff"; e.target.style.borderColor = "#00D4FF"; }}
        onMouseLeave={e => { e.target.style.color = "#8B949E"; e.target.style.borderColor = "#21262D"; }}
      >
        ✕ Clear
      </button>
    </div>
  );
}
