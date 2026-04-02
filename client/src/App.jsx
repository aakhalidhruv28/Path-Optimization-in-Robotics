/**
 * App.jsx — Dashboard Root (no footer, 3-column layout)
 * ======================================================
 * Column layout:
 *   Left (40%):  APF Canvas + interaction guide
 *   Middle (25%): Math Panel (live step-by-step)
 *   Right (35%): 3D Cost Surface + Telemetry
 *
 * State:
 *   • Canvas state → masterRef (zero re-renders)
 *   • telemetry, surface, math → useState (small, infrequent)
 */

import { useState, useCallback, useRef } from "react";
import { useAPFCanvas } from "./hooks/useAPFCanvas";
import { useWebSocket } from "./hooks/useWebSocket";
import CostSurface      from "./components/CostSurface";
import Telemetry        from "./components/Telemetry";
import Header           from "./components/Header";
import MathPanel        from "./components/MathPanel";

const APF_PARAMS = { k_att: 1.0, k_rep: 0.08, rho0: 0.18, alpha: 0.005 };

export default function App() {
  const canvasRef    = useRef(null);
  const sendSceneRef = useRef(null);   // bridges canvas → WS without circular dep

  const [surface,  setSurface]  = useState([]);
  const [math,     setMath]     = useState(null);

  const onSceneChange = useCallback((scene) => sendSceneRef.current?.(scene), []);
  const onSurface     = useCallback((s) => setSurface(s),  []);
  const onMath        = useCallback((m) => setMath(m),     []);

  // 1. Canvas hook
  const { onPointerDown, onPointerMove, onPointerUp, clearObstacles, setServerPath } =
    useAPFCanvas(canvasRef, onSceneChange);

  // 2. WebSocket hook
  const { connected, telemetry, sendScene } =
    useWebSocket(setServerPath, onSurface, onMath);

  sendSceneRef.current = sendScene;

  return (
    <div className="h-screen bg-[#0D1117] text-white flex flex-col font-sans overflow-hidden">
      <Header connected={connected} />

      {/* 3-column main grid */}
      <main className="flex-1 min-h-0 grid gap-3 p-3 overflow-hidden"
            style={{ gridTemplateColumns: "2.2fr 1.4fr 1.8fr" }}>

        {/* ── Col 1: APF Canvas ─────────────────────────────────────── */}
        <section className="flex flex-col gap-2 min-h-0 overflow-hidden">
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-sm font-semibold">APF Sandbox</h2>
              <p className="text-[10px] text-[#8B949E] mt-0.5">
                Drag markers · Paint obstacles · Watch gradient descent
              </p>
            </div>
            <div className="flex gap-1 text-[8.5px] font-mono text-[#8B949E] flex-wrap justify-end">
              {Object.entries(APF_PARAMS).map(([k, v]) => (
                <span key={k} className="bg-[#0D1117] border border-[#21262D] px-1.5 py-0.5 rounded">
                  {k}={v}
                </span>
              ))}
            </div>
          </div>

          {/* Canvas */}
          <div
            className="flex-1 relative rounded-xl border border-[#21262D] overflow-hidden min-h-0"
            style={{ boxShadow: "0 0 24px rgba(0,212,255,0.05)" }}
          >
            <canvas
              ref={canvasRef}
              id="apf-canvas"
              aria-label="APF Navigation Sandbox"
              className="block w-full h-full cursor-crosshair touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />

            {/* Legend overlay */}
            <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap">
              {[
                { color: "#00FF9F", label: "Start",    shape: "circle"  },
                { color: "#FFD700", label: "Goal",     shape: "diamond" },
                { color: "#FF6B35", label: "Obstacle", shape: "circle"  },
                { color: "#00D4FF", label: "Path",     shape: "line"    },
              ].map(({ color, label, shape }) => (
                <span key={label}
                  className="flex items-center gap-1 text-[8.5px] font-mono text-[#8B949E] bg-[#161B22]/90 backdrop-blur border border-[#21262D] rounded px-1.5 py-0.5">
                  {shape === "line"
                    ? <span style={{ width:14, height:2, background:color, display:"inline-block", borderRadius:1 }}/>
                    : <span style={{ width:7, height:7, background:color, display:"inline-block",
                                     borderRadius: shape==="circle"?"50%":2,
                                     transform: shape==="diamond"?"rotate(45deg)":"none" }}/>
                  }
                  {label}
                </span>
              ))}
            </div>

            {/* Clear button */}
            <button
              id="clear-obstacles-btn"
              onClick={clearObstacles}
              className="absolute top-2 right-2 text-[10px] font-mono px-2.5 py-1 rounded bg-[#0D1117] border border-[#21262D] text-[#8B949E] hover:text-white hover:border-[#00D4FF] transition-all duration-150"
            >
              ✕ Clear
            </button>
          </div>

          {/* Interaction guide */}
          <div className="grid grid-cols-3 gap-1.5 flex-shrink-0">
            {[
              { icon: "⬤→⬤", label: "Drag Start / Goal",     color: "#00FF9F" },
              { icon: "✏",    label: "Drag to Paint Obstacles", color: "#FF6B35" },
              { icon: "✕",    label: "Button to Clear",         color: "#8B949E" },
            ].map(({ icon, label, color }) => (
              <div key={label}
                className="bg-[#0D1117] border border-[#21262D] rounded-lg py-1.5 px-2 flex flex-col items-center gap-0.5">
                <span style={{ color, fontSize: 13 }}>{icon}</span>
                <span className="text-[8.5px] font-mono text-[#8B949E] text-center">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Col 2: Live Math Solutions ─────────────────────────────── */}
        <section className="flex flex-col gap-2 min-h-0 overflow-hidden">
          <div className="flex-shrink-0">
            <h2 className="text-sm font-semibold">Math Solutions</h2>
            <p className="text-[10px] text-[#8B949E] mt-0.5">Live step-by-step computation</p>
          </div>
          <div className="flex-1 min-h-0 bg-[#161B22] border border-[#21262D] rounded-xl p-3 overflow-y-auto">
            <MathPanel math={math} params={APF_PARAMS} />
          </div>
        </section>

        {/* ── Col 3: 3D Surface + Telemetry ─────────────────────────── */}
        <aside className="flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* 3D Cost Surface */}
          <div className="flex-1 min-h-0 bg-[#161B22] border border-[#21262D] rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#21262D] flex-shrink-0">
              <span className="text-xs font-semibold">Cost Surface</span>
              <span className="text-[9px] font-mono text-[#8B949E]">
                U(q) = U<sub>att</sub> + U<sub>rep</sub>
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <CostSurface surface={surface} />
            </div>
          </div>

          {/* Telemetry */}
          <div className="flex-shrink-0 bg-[#161B22] border border-[#21262D] rounded-xl p-3">
            <Telemetry
              distance={telemetry.distance}
              velocity={telemetry.velocity}
              totalCost={telemetry.total_cost}
              connected={connected}
            />
          </div>
        </aside>

      </main>
    </div>
  );
}
