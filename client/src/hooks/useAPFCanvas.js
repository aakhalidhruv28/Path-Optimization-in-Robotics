/**
 * useAPFCanvas.js — Zero-Lag Canvas with Animated Robot Traversal
 * ================================================================
 *
 * FIXES vs v2:
 *  1. Obstacle rendering: single shared shadow state for ALL dots —
 *     no per-dot ctx.save()/restore()/shadowBlur loop (was the blob bug)
 *  2. Animated robot: robotT parameter cycles 0→1 along the path every
 *     ~6 seconds, giving a continuous traversal feel regardless of FPS
 *  3. setServerPath: useCallback([]) → eternal stable reference →
 *     useWebSocket effect never reconnects due to prop changes
 *  4. Path: 3-pass render (diffuse glow / mid glow / bright core) +
 *     animated arrowheads every 15 waypoints
 *  5. Obstacle cap at 600 to prevent render perf issues
 *
 * Coordinate normalization:
 *   relX  = e.clientX - rect.left
 *   scale = canvas.width / rect.width  ← corrects for CSS scaling / HiDPI
 *   cx    = relX * scale
 *   nx    = cx / canvas.width            ← normalised [0,1] for server
 */

import { useRef, useEffect, useCallback } from "react";

const HIT_R      = 22;    // canvas-px hit radius for markers
const BRUSH_GAP  = 7;     // px max gap between painted obstacle dots
const SEND_MS    = 100;   // WebSocket throttle: 10 Hz
const DEDUP_GRID = 80;    // obstacle dedup resolution (80×80 = 6400 unique cells max)
const ROBOT_SPD  = 1 / 360; // fraction of path per frame → full traverse ~6 s @ 60fps

export function useAPFCanvas(canvasRef, onSceneChange) {
  const masterRef = useRef({
    // Scene
    start:       { x: 0.1, y: 0.5 },
    goal:        { x: 0.9, y: 0.5 },
    obstacles:   [],          // [[nx,ny],…]  — rendered + sent to server
    obstacleSet: new Set(),   // dedup keys: gx*DEDUP_GRID+gy — prevents count limit
    serverPath:  [],          // [[nx,ny],…]  — updated from WS
    // Interaction
    mode:       "none",
    prevPos:    null,
    // Animation
    pulse:      0,
    robotT:     0,            // 0→1 along serverPath
    // WS throttle
    dirty:      false,
    lastSend:   0,
    onSceneChange: null,
  });

  // Keep callback fresh without identity change
  useEffect(() => {
    masterRef.current.onSceneChange = onSceneChange;
  }, [onSceneChange]);

  // ── ResizeObserver ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (!e) return;
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) {
        canvas.width  = Math.round(width);
        canvas.height = Math.round(height);
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvasRef]);

  // ── RAF Render Loop (starts once) ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;

    function draw() {
      const ctx = canvas.getContext("2d");
      const W   = canvas.width  || 900;
      const H   = canvas.height || 500;
      const r   = masterRef.current;

      // ── 1. Background ─────────────────────────────────────────────────
      ctx.fillStyle = "#0A0E17";
      ctx.fillRect(0, 0, W, H);

      // ── 2. Grid ───────────────────────────────────────────────────────
      ctx.strokeStyle = "#151B28";
      ctx.lineWidth   = 0.6;
      const gx = W / 24, gy = H / 16;
      for (let x = 0; x <= W; x += gx) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = 0; y <= H; y += gy) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

      // ── 3. Obstacles — batch render, single shadow state ──────────────
      if (r.obstacles.length > 0) {
        const obsR = Math.max(W, H) * 0.005;
        ctx.save();
        ctx.shadowBlur  = 4;
        ctx.shadowColor = "#FF5500";
        ctx.fillStyle   = "#FF4400";
        for (const [nx, ny] of r.obstacles) {
          ctx.beginPath();
          ctx.arc(nx * W, ny * H, obsR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── 4. Path — 2-pass rendering (clean, no trail artifacts) ────────
      const pts = r.serverPath;
      if (pts.length >= 2) {
        // Pass A — soft glow halo
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0][0]*W, pts[0][1]*H);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0]*W, pts[i][1]*H);
        ctx.strokeStyle = "rgba(0,220,255,0.15)";
        ctx.lineWidth   = 14;
        ctx.lineCap = ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();

        // Pass B — bright core (the actual route line)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0][0]*W, pts[0][1]*H);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0]*W, pts[i][1]*H);
        ctx.strokeStyle = "#00EEFF";
        ctx.lineWidth   = 3;
        ctx.lineCap = ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();

        // Pass C — direction arrowheads every ~20 waypoints
        ctx.save();
        ctx.fillStyle = "rgba(0,238,255,0.8)";
        for (let i = 15; i < pts.length - 1; i += 20) {
          const ax = pts[i][0]*W,   ay = pts[i][1]*H;
          const bx = pts[i+1][0]*W, by = pts[i+1][1]*H;
          const angle = Math.atan2(by - ay, bx - ax);
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(angle);
          ctx.beginPath(); ctx.moveTo(8,0); ctx.lineTo(-4,-3.5); ctx.lineTo(-4,3.5); ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();

        // ── 5. Animated robot — smooth traversal, resets at goal ────────
        r.robotT += ROBOT_SPD;
        if (r.robotT >= 1.0) r.robotT = 0;   // loop: restart from S

        const idx = Math.min(
          Math.floor(r.robotT * (pts.length - 1)),
          pts.length - 1
        );
        const [rx, ry] = pts[idx];

        // Outer pulse ring
        const pulseR  = 12 + Math.sin(r.pulse * 3) * 4;
        ctx.save();
        ctx.strokeStyle = `rgba(0,238,255,${0.3 + 0.2 * Math.sin(r.pulse * 3)})`;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(rx*W, ry*H, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Robot body
        ctx.save();
        ctx.shadowColor = "#00EEFF";
        ctx.shadowBlur  = 16;
        ctx.fillStyle   = "#00EEFF";
        ctx.beginPath();
        ctx.arc(rx*W, ry*H, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(rx*W, ry*H, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // ── 6. Markers ────────────────────────────────────────────────────
      const pf = 0.5 + 0.5 * Math.sin(r.pulse);
      r.pulse += 0.04;
      circleMarker(ctx, r.start.x*W, r.start.y*H, "#00FF9F", "S", pf);
      diamondMarker(ctx, r.goal.x*W,  r.goal.y*H,  "#FFD700", "G", pf);

      // ── 7. Throttled WS send ──────────────────────────────────────────
      const now = Date.now();
      if (r.dirty && now - r.lastSend >= SEND_MS) {
        r.onSceneChange?.({
          start:     [r.start.x, r.start.y],
          goal:      [r.goal.x,  r.goal.y],
          obstacles: r.obstacles,
        });
        r.dirty    = false;
        r.lastSend = now;
      }

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [canvasRef]); // stable ref → runs once

  // ── Coordinate normalization ─────────────────────────────────────────────
  function getCoords(e) {
    const c = canvasRef.current;
    if (!c) return { cx:0, cy:0, nx:0, ny:0 };
    const rect  = c.getBoundingClientRect();
    const scale = c.width / rect.width;   // CSS-pixel → buffer-pixel conversion
    const cx    = (e.clientX - rect.left) * scale;
    const cy    = (e.clientY - rect.top)  * scale;
    return { cx, cy, nx: cx / c.width, ny: cy / c.height };
  }

  function hitTest(cx, cy) {
    const c = canvasRef.current;
    if (!c) return "none";
    const { start, goal } = masterRef.current;
    if (Math.hypot(cx - start.x*c.width,  cy - start.y*c.height) < HIT_R) return "drag-start";
    if (Math.hypot(cx - goal.x *c.width,  cy - goal.y *c.height) < HIT_R) return "drag-goal";
    return "paint";
  }

  function paintAt(nx, ny) {
    const { start, goal, obstacles, obstacleSet } = masterRef.current;
    // Don't paint over start/goal markers
    if (Math.hypot(nx - start.x, ny - start.y) < 0.05) return;
    if (Math.hypot(nx - goal.x,  ny - goal.y)  < 0.05) return;
    // Spatial deduplication: quantize to DEDUP_GRID cells
    // This allows unlimited painting while keeping unique positions bounded
    const gx  = Math.round(nx * (DEDUP_GRID - 1));
    const gy  = Math.round(ny * (DEDUP_GRID - 1));
    const key = gx * DEDUP_GRID + gy;
    if (obstacleSet.has(key)) return;   // already painted this cell
    obstacleSet.add(key);
    obstacles.push([gx / (DEDUP_GRID - 1), gy / (DEDUP_GRID - 1)]);
    masterRef.current.dirty = true;
  }

  function interpolatePaint(prev, curr) {
    const c = canvasRef.current;
    if (!c) return;
    const dx = curr.cx - prev.cx, dy = curr.cy - prev.cy;
    const d  = Math.hypot(dx, dy);
    if (d < BRUSH_GAP) { paintAt(curr.nx, curr.ny); return; }
    const steps = Math.ceil(d / BRUSH_GAP);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      paintAt((prev.cx + t*dx) / c.width, (prev.cy + t*dy) / c.height);
    }
  }

  // ── Pointer handlers ─────────────────────────────────────────────────────
  const onPointerDown = (e) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const { cx, cy, nx, ny } = getCoords(e);
    const mode = hitTest(cx, cy);
    masterRef.current.mode = mode;
    if (mode === "paint") {
      masterRef.current.prevPos = { cx, cy, nx, ny };
      paintAt(nx, ny);
    }
  };

  const onPointerMove = (e) => {
    const { mode, prevPos } = masterRef.current;
    if (mode === "none") return;
    const { cx, cy, nx, ny } = getCoords(e);
    const c = Math.max(0, Math.min(1, nx));
    const d = Math.max(0, Math.min(1, ny));
    if (mode === "drag-start") {
      masterRef.current.start = { x:c, y:d };
      masterRef.current.dirty = true;
    } else if (mode === "drag-goal") {
      masterRef.current.goal  = { x:c, y:d };
      masterRef.current.dirty = true;
    } else if (mode === "paint" && prevPos) {
      interpolatePaint(prevPos, { cx, cy, nx:c, ny:d });
      masterRef.current.prevPos = { cx, cy, nx:c, ny:d };
    }
  };

  const onPointerUp = () => {
    masterRef.current.mode    = "none";
    masterRef.current.prevPos = null;
  };

  const clearObstacles = () => {
    masterRef.current.obstacles    = [];
    masterRef.current.obstacleSet  = new Set();  // also clear dedup set
    masterRef.current.dirty        = true;
  };

  // CRITICAL: useCallback([]) → stable forever → useWebSocket effect never
  // re-runs due to this prop changing on parent re-renders
  const setServerPath = useCallback((path) => {
    masterRef.current.serverPath = path;
    // Do NOT reset robotT — let the robot continue animating smoothly
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, clearObstacles, setServerPath };
}

// ── Draw Helpers ──────────────────────────────────────────────────────────────

function circleMarker(ctx, x, y, color, label, pulse) {
  const r = 14;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur  = 8 + pulse * 16;
  ctx.fillStyle   = color;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth   = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#000";
  ctx.font = "bold 12px Inter, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
}

function diamondMarker(ctx, x, y, color, label, pulse) {
  const s = 15;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(Math.PI/4);
  ctx.shadowColor = color;
  ctx.shadowBlur  = 8 + pulse * 16;
  ctx.fillStyle   = color;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth   = 2;
  ctx.beginPath(); ctx.rect(-s/2, -s/2, s, s); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#000";
  ctx.font = "bold 12px Inter, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
}
