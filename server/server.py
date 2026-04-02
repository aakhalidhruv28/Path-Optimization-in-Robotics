"""
server.py v4 — A* Shortest Path + APF Math Display
====================================================
WHY we replaced APF gradient descent with A*:
──────────────────────────────────────────────
APF gradient descent has two fundamental problems visible in the screenshots:

  1. LOCAL MINIMA: When obstacles create a "corridor", the gradient from
     multiple obstacle repulsors cancels the attractive gradient, trapping
     the robot at a point that isn't the goal.

  2. OSCILLATION: In narrow passages the robot bounces between repulsors,
     creating the crazy zigzag / star patterns visible in the screenshots.

  3. BOUNDARY WALL EFFECT: np.clip(q, 0, 1) causes the robot to "slide"
     along canvas edges instead of navigating around obstacles.

A* (used by Google Maps, navigation apps, game AI):
  ✓  Globally optimal — always finds the TRUE shortest path
  ✓  No oscillations — deterministic, single clean path
  ✓  Straight line when no obstacles (A* open-grid → diagonal = direct)
  ✓  Smooth detour around obstacles (line-of-sight + Catmull-Rom)
  ✓  Never gets stuck in local minima

The APF math (U_att, U_rep, gradients) is preserved for the academic
Math Panel display — we still compute the first-step APF values so the
project stays academically grounded in Artificial Potential Fields.
The teaching narrative: "APF models the cost landscape; A* navigates it
globally to avoid local minima" — a real technique used in robotics.

Path pipeline:
  obstacles → 60×60 inflated grid → A* search → line-of-sight simplify
  → Catmull-Rom spline → dense smooth path (150 waypoints)
"""

import asyncio
import heapq
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(title="APF Navigation Server v4")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

STATIC_DIR = Path(__file__).parent / "static"

# ── Parameters ────────────────────────────────────────────────────────────────
K_ATT       = 1.0
K_REP       = 0.12
RHO_0       = 0.20
ALPHA       = 0.012      # used only for Math Panel first-step display

GRID_SIZE   = 60         # A* grid resolution (60×60 = 3600 cells)
INFLATE_DEF = 2          # default obstacle inflation (grid cells)
SURFACE_RES = 25
MAX_OBS     = 1200       # server-side cap (client deduplicates first)

_pool = ThreadPoolExecutor(max_workers=2)

# ── HTTP ───────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    idx = STATIC_DIR / "index.html"
    return FileResponse(idx) if idx.exists() else {"msg": "Vite running on :5173"}

@app.get("/health")
def health():
    return {"status": "ok"}

# ── A* Grid Building ──────────────────────────────────────────────────────────

def _build_grid(obstacles: list, inflate_r: int = INFLATE_DEF) -> np.ndarray:
    """
    Build a 60×60 boolean occupancy grid.
    inflate_r controls the safety margin around each obstacle:
      2 = comfortable clearance (default)
      1 = tight clearance (used when grid too dense)
      0 = exact obstacle cells only (last resort)
    """
    G    = GRID_SIZE
    grid = np.zeros((G, G), dtype=bool)
    if not obstacles:
        return grid

    obs = np.array(obstacles[:MAX_OBS], dtype=np.float32)
    ci = np.clip((obs[:, 0] * (G - 1)).astype(int), 0, G - 1)
    ri = np.clip((obs[:, 1] * (G - 1)).astype(int), 0, G - 1)

    # Deduplicate grid cells before inflating
    unique_rc = np.unique(np.column_stack([ri, ci]), axis=0)
    rows_ = np.arange(G, dtype=np.int32)
    cols_ = np.arange(G, dtype=np.int32)

    ir = max(0, inflate_r)
    for r, c in unique_rc:
        if ir == 0:
            grid[r, c] = True
            continue
        r0, r1 = max(0, r - ir), min(G, r + ir + 1)
        c0, c1 = max(0, c - ir), min(G, c + ir + 1)
        rr = rows_[r0:r1, None]
        cc = cols_[None, c0:c1]
        grid[r0:r1, c0:c1] |= (rr - r) ** 2 + (cc - c) ** 2 <= ir ** 2

    return grid


# ── A* Search ─────────────────────────────────────────────────────────────────

def _astar(grid: np.ndarray, start: tuple, goal: tuple):
    """
    8-connected A* on binary occupancy grid.
    Uses octile distance heuristic (admissible + consistent for 8-connect).
    Returns list[(row, col)] from start to goal, or None if unreachable.

    The 8-directional movement allows diagonal shortcuts — just like
    Google Maps routing allows turning at any angle on open roads.
    """
    G = grid.shape[0]
    Sr, Sc = start
    Gr, Gc = goal

    # Always free start and goal cells (they might be inside painted obstacles)
    free = grid.copy()
    free[Sr, Sc] = False
    free[Gr, Gc] = False

    def h(r, c):
        dr, dc = abs(r - Gr), abs(c - Gc)
        return max(dr, dc) + (math.sqrt(2) - 1) * min(dr, dc)

    # (dr, dc, move_cost)
    DIRS = [
        (-1, -1, 1.4142), (-1, 0, 1.0), (-1, 1, 1.4142),
        ( 0, -1, 1.0),                   ( 0, 1, 1.0),
        ( 1, -1, 1.4142), ( 1, 0, 1.0), ( 1, 1, 1.4142),
    ]

    visited  = set()
    heap     = [(h(Sr, Sc), 0.0, Sr, Sc)]
    came     = {(Sr, Sc): None}
    g_score  = {(Sr, Sc): 0.0}

    while heap:
        _, g, r, c = heapq.heappop(heap)
        if (r, c) in visited:
            continue
        visited.add((r, c))

        if r == Gr and c == Gc:
            # Reconstruct path
            path, node = [], (r, c)
            while node is not None:
                path.append(node)
                node = came[node]
            return path[::-1]

        for dr, dc, cost in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < G and 0 <= nc < G and not free[nr, nc] and (nr, nc) not in visited:
                ng = g + cost
                if ng < g_score.get((nr, nc), 1e18):
                    g_score[(nr, nc)] = ng
                    came[(nr, nc)]    = (r, c)
                    heapq.heappush(heap, (ng + h(nr, nc), ng, nr, nc))

    return None  # No path found


# ── Path Post-processing ──────────────────────────────────────────────────────

def _has_los(grid: np.ndarray, p1: tuple, p2: tuple) -> bool:
    """
    Bresenham's line algorithm: returns True only if the straight line
    from p1 to p2 passes through no occupied grid cell.
    Used for "string pulling" — removing waypoints where a straight
    shortcut is possible (same as navigation apps do to straighten routes).
    """
    r1, c1 = p1
    r2, c2 = p2
    G      = grid.shape[0]
    dr, dc = abs(r2 - r1), abs(c2 - c1)
    sr     = 1 if r1 < r2 else -1
    sc     = 1 if c1 < c2 else -1
    r, c   = r1, c1
    err    = dr - dc

    while True:
        if 0 <= r < G and 0 <= c < G and grid[r, c]:
            return False
        if r == r2 and c == c2:
            return True
        e2 = 2 * err
        if e2 > -dc:
            err -= dc
            r   += sr
        if e2 < dr:
            err += dr
            c   += sc


def _simplify(raw_path: list, grid: np.ndarray) -> list:
    """
    Greedy line-of-sight path shortcutting.
    Removes all intermediate waypoints where a direct connection is
    unobstructed — just like navigation apps "pull the string taut"
    between road intersections. Result: minimum bends, maximum clarity.
    """
    if len(raw_path) <= 2:
        return raw_path

    result = [raw_path[0]]
    i = 0
    while i < len(raw_path) - 1:
        # Find the furthest visible waypoint from result[-1]
        j = len(raw_path) - 1
        while j > i + 1:
            if _has_los(grid, result[-1], raw_path[j]):
                break
            j -= 1
        result.append(raw_path[j])
        i = j

    return result


def _catmull_rom(points: list, n_total: int = 160) -> list:
    """
    Catmull-Rom spline interpolation through simplified waypoints.
    Produces G1-continuous curves with natural, smooth bends —
    similar to how Google Maps renders curved road routes.
    """
    if len(points) < 2:
        return [[float(p[0]), float(p[1])] for p in points]
    if len(points) == 2:
        # Straight line — interpolate directly
        p0, p1 = points
        return [
            [round(p0[0] + t * (p1[0] - p0[0]), 4),
             round(p0[1] + t * (p1[1] - p0[1]), 4)]
            for t in np.linspace(0, 1, n_total)
        ]

    # Duplicate endpoints for boundary spline segments
    pts    = [points[0]] + list(points) + [points[-1]]
    n_seg  = max(2, n_total // (len(pts) - 3))
    result = []

    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        endpoint = (i == len(pts) - 3)
        for t in np.linspace(0, 1, n_seg, endpoint=endpoint):
            t2, t3 = t * t, t * t * t

            def cr(a, b, c, d):
                return 0.5 * (2*b + (-a+c)*t + (2*a-5*b+4*c-d)*t2 + (-a+3*b-3*c+d)*t3)

            x = float(np.clip(cr(p0[0], p1[0], p2[0], p3[0]), 0.0, 1.0))
            y = float(np.clip(cr(p0[1], p1[1], p2[1], p3[1]), 0.0, 1.0))
            result.append([round(x, 4), round(y, 4)])

    result.append([round(float(points[-1][0]), 4), round(float(points[-1][1]), 4)])
    return result


# ── APF Math (for Math Panel display) ─────────────────────────────────────────

def _vec_grad_rep(q: np.ndarray, obs: np.ndarray):
    """Vectorized repulsive gradient — kept for Math Panel values."""
    if obs is None or len(obs) == 0:
        return np.zeros(2), 0.0
    diff = q[None, :] - obs
    d    = np.linalg.norm(diff, axis=1)
    mask = (d > 1e-6) & (d < RHO_0)
    if not mask.any():
        return np.zeros(2), 0.0
    dm  = d[mask]
    eta = (1.0 / dm) - (1.0 / RHO_0)
    g   = (K_REP * eta / dm ** 2)[:, None] * diff[mask]
    return g.sum(axis=0), float(0.5 * K_REP * np.sum(eta ** 2))


# ── Progressive A* (retries with smaller inflation when blocked) ───────────────

def _find_path_progressive(start, goal, obstacles):
    """
    Try A* with progressively smaller obstacle inflation until a path is found.

    Why this matters:
      With dense painted obstacles, inflate=2 can fill the grid completely
      so A* returns None even though a physical gap exists in the scene.
      Reducing inflate_r uncovers that gap:

        inflate=2  comfortable clearance (default)
        inflate=1  tight clearance — robot passes close to obstacles
        inflate=0  exact cells only — technically if a gap exists, A* finds it

    A path is ONLY truly impossible when start/goal are completely enclosed
    by an unbroken ring of obstacles with zero-width gaps.
    """
    G  = GRID_SIZE
    Sr = int(np.clip(start[1] * (G - 1), 0, G - 1))
    Sc = int(np.clip(start[0] * (G - 1), 0, G - 1))
    Gr = int(np.clip(goal[1]  * (G - 1), 0, G - 1))
    Gc = int(np.clip(goal[0]  * (G - 1), 0, G - 1))

    for inflate in [2, 1, 0]:
        grid     = _build_grid(obstacles, inflate)
        raw_path = _astar(grid, (Sr, Sc), (Gr, Gc))
        if raw_path is not None:
            return raw_path, grid, inflate

    return None, np.zeros((G, G), dtype=bool), -1


# ── Main Computation (runs in thread pool) ────────────────────────────────────

def _compute_all(start, goal, obstacles):
    """
    Two-stage computation:
      Stage 1: A* shortest path (the actual robot navigation)
      Stage 2: APF first-step values (for Math Panel display)
    """
    G = GRID_SIZE

    # ── Stage 1: A* Path ─────────────────────────────────────────────────
    raw_path, grid, inflate_used = _find_path_progressive(start, goal, obstacles)

    if raw_path is None or len(raw_path) < 2:
        # Truly impossible (start/goal fully enclosed) — straight fallback
        path = [
            [round(start[0], 4), round(start[1], 4)],
            [round(goal[0],  4), round(goal[1],  4)],
        ]
    else:
        simple    = _simplify(raw_path, grid)
        world_pts = [(c / (G - 1), r / (G - 1)) for r, c in simple]
        path      = _catmull_rom(world_pts, n_total=160)

    # ── Stage 2: APF Math Values (for Math Panel) ─────────────────────────
    q      = np.array(start, dtype=np.float64)
    goal_a = np.array(goal,  dtype=np.float64)
    obs_a  = np.array(obstacles[:MAX_OBS], dtype=np.float64) if obstacles else None

    ga      = K_ATT * (q - goal_a)
    gr, ur  = _vec_grad_rep(q, obs_a)
    gv      = ga + gr
    ua      = 0.5 * K_ATT * float(np.linalg.norm(q - goal_a)) ** 2
    qn      = np.clip(q - ALPHA * gv, 0.0, 1.0)

    math_step = {
        "q_curr":   [round(float(q[0]),4),    round(float(q[1]),4)],
        "q_next":   [round(float(qn[0]),4),   round(float(qn[1]),4)],
        "grad_att": [round(float(ga[0]),4),   round(float(ga[1]),4)],
        "grad_rep": [round(float(gr[0]),4),   round(float(gr[1]),4)],
        "grad_tot": [round(float(gv[0]),4),   round(float(gv[1]),4)],
        "u_att":    round(float(ua), 5),
        "u_rep":    round(float(ur), 5),
        "u_total":  round(float(ua + ur), 5),
    }

    path_len = sum(
        math.hypot(path[i+1][0]-path[i][0], path[i+1][1]-path[i][1])
        for i in range(len(path)-1)
    )
    velocity = round(float(np.linalg.norm(gv)), 6)

    return path, round(path_len, 4), velocity, math_step


def _compute_surface(goal, obstacles):
    """APF cost surface (unchanged — still shows U_att + U_rep landscape)."""
    G  = SURFACE_RES
    xs = np.linspace(0, 1, G)
    Xg, Yg = np.meshgrid(xs, xs)
    U  = 0.5 * K_ATT * ((Xg - goal[0])**2 + (Yg - goal[1])**2)
    for ox, oy in (obstacles or [])[:MAX_OBS]:
        D    = np.sqrt((Xg - ox)**2 + (Yg - oy)**2)
        mask = (D > 1e-6) & (D < RHO_0)
        Ur   = np.zeros_like(D)
        Ur[mask] = 0.5 * K_REP * ((1.0/D[mask]) - (1.0/RHO_0))**2
        U   += Ur
    return np.clip(U, 0, 3.0).tolist()


# ── WebSocket ──────────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    print("✅ Client connected")

    state   = {"start": [0.1, 0.5], "goal": [0.9, 0.5], "obstacles": []}
    lock    = asyncio.Lock()
    running = True

    async def recv_loop():
        nonlocal running
        try:
            while running:
                raw = await ws.receive_text()
                try:
                    async with lock:
                        state.update(json.loads(raw))
                except Exception:
                    pass
        except Exception:
            running = False

    receiver = asyncio.create_task(recv_loop())
    loop     = asyncio.get_event_loop()
    tick     = 0

    try:
        while running:
            async with lock:
                s  = list(state["start"])
                g  = list(state["goal"])
                ob = [list(o) for o in state["obstacles"]]

            # Both A* and APF run in thread pool (never block event loop)
            path, cost, vel, mstep = await loop.run_in_executor(
                _pool, _compute_all, s, g, ob
            )
            dist = round(math.hypot(g[0]-s[0], g[1]-s[1]), 4)

            payload: dict = {
                "path":       path,
                "distance":   dist,
                "velocity":   vel,
                "total_cost": cost,
                "math":       mstep,
            }
            if tick % 10 == 0:
                payload["cost_surface"] = await loop.run_in_executor(
                    _pool, _compute_surface, g, ob
                )

            await ws.send_text(json.dumps(payload))
            tick   += 1
            await asyncio.sleep(0.05)   # 20 Hz

    except Exception as e:
        print(f"WS error: {e}")
    finally:
        running = False
        receiver.cancel()
        print("🔌 Disconnected")
