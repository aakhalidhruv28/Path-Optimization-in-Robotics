/**
 * canvasRenderer.js — 2D Canvas Rendering Engine
 * ================================================
 * Pure drawing functions for the APF sandbox canvas.
 * Kept separate from React components so rendering logic is testable
 * and doesn't trigger any React re-render cycle.
 *
 * Coordinate system: all inputs are normalized [0,1] and scaled to canvas size.
 */

// ── Color tokens (must match tailwind brand colors) ───────────────────────────
export const COLORS = {
  bg:           "#0D1117",
  grid:         "#21262D",
  obstacle:     "#FF6B35",
  obstacleGlow: "#FF6B3533",
  path:         "#00D4FF",
  pathGlow:     "#00D4FF44",
  start:        "#00FF9F",
  startGlow:    "#00FF9F55",
  goal:         "#FFD700",
  goalGlow:     "#FFD70044",
  robot:        "#00D4FF",
};

/**
 * clearCanvas — fill background and draw subtle grid
 */
export function clearCanvas(ctx, W, H) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid lines
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  const step = W / 20;
  for (let x = 0; x <= W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

/**
 * drawObstacles — render all obstacle dots with a glow halo
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} obstacles — array of [nx, ny] normalized positions
 */
export function drawObstacles(ctx, W, H, obstacles) {
  const r = W * 0.008; // Obstacle dot radius in pixels

  obstacles.forEach(([nx, ny]) => {
    const x = nx * W;
    const y = ny * H;

    // Glow halo
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    grad.addColorStop(0, "#FF6B3588");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 3, 0, Math.PI * 2);
    ctx.fill();

    // Solid dot
    ctx.fillStyle = COLORS.obstacle;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * drawPath — render the APF gradient-descent path as a glowing cyan line.
 * Adds a thick blur-like glow layer behind the main line.
 * @param {Array} path — array of [nx, ny] normalized waypoints
 */
export function drawPath(ctx, W, H, path) {
  if (!path || path.length < 2) return;

  // ── Glow layer (thick, semi-transparent) ─────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(path[0][0] * W, path[0][1] * H);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i][0] * W, path[i][1] * H);
  }
  ctx.strokeStyle = COLORS.pathGlow;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // ── Main path line ────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(path[0][0] * W, path[0][1] * H);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i][0] * W, path[i][1] * H);
  }
  ctx.strokeStyle = COLORS.path;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // ── Animated robot dot at path end ───────────────────────────────────────
  const last = path[path.length - 1];
  const rx = last[0] * W;
  const ry = last[1] * H;
  const rr = 7;

  // Outer glow
  const rGrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr * 3);
  rGrad.addColorStop(0, "#00D4FFCC");
  rGrad.addColorStop(1, "transparent");
  ctx.fillStyle = rGrad;
  ctx.beginPath();
  ctx.arc(rx, ry, rr * 3, 0, Math.PI * 2);
  ctx.fill();

  // Inner dot
  ctx.fillStyle = COLORS.robot;
  ctx.beginPath();
  ctx.arc(rx, ry, rr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/**
 * drawMarker — draw a labeled marker (Start or Goal).
 * Start = pulsing green circle; Goal = gold diamond.
 * @param {"start"|"goal"} type
 */
export function drawMarker(ctx, W, H, nx, ny, type, pulse = false) {
  const x = nx * W;
  const y = ny * H;
  const r = 14;

  const color = type === "start" ? COLORS.start : COLORS.goal;
  const glowColor = type === "start" ? COLORS.startGlow : COLORS.goalGlow;
  const label = type === "start" ? "S" : "G";

  // ── Glow halo ─────────────────────────────────────────────────────────────
  const glowR = pulse ? r * 3.5 : r * 2.5;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  grad.addColorStop(0, glowColor);
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fill();

  if (type === "goal") {
    // ── Diamond shape for Goal ─────────────────────────────────────────────
    const s = r * 1.2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-s / 2, -s / 2, s, s);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else {
    // ── Circle for Start ──────────────────────────────────────────────────
    ctx.fillStyle = color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ── Label ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#000";
  ctx.font = `bold ${r}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
}

/**
 * renderFrame — main render function called on every animation frame.
 * Composites all layers in order: bg → obstacles → path → markers.
 */
export function renderFrame(ctx, W, H, { obstacles, path, start, goal, pulse }) {
  clearCanvas(ctx, W, H);
  drawObstacles(ctx, W, H, obstacles);
  drawPath(ctx, W, H, path);
  drawMarker(ctx, W, H, start.x, start.y, "start", pulse);
  drawMarker(ctx, W, H, goal.x,  goal.y,  "goal", pulse);
}
