/**
 * MathPanel.jsx — Live Step-by-Step APF Computation
 * ===================================================
 * Shows the actual math being computed each frame:
 *   • Current + next robot position
 *   • Attractive and repulsive gradients (with values)
 *   • Potential energy breakdown
 *   • The gradient descent update step
 */

import { memo } from "react";

const VAL = ({ v, color = "#00D4FF" }) => (
  <span style={{ color, fontFamily: "monospace", fontWeight: 600 }}>{v}</span>
);

const Row = ({ label, eq, val, color }) => (
  <div className="flex items-start justify-between gap-2 py-0.5">
    <span className="text-[#8B949E] text-[9px] font-mono w-20 flex-shrink-0">{label}</span>
    <span className="text-[#6E7681] text-[9px] font-mono flex-1">{eq}</span>
    <VAL v={val} color={color} />
  </div>
);

function fmt2(arr) {
  if (!arr) return "[—, —]";
  return `[${arr[0]?.toFixed(3) ?? "—"}, ${arr[1]?.toFixed(3) ?? "—"}]`;
}

function fmtN(v, dp = 5) {
  if (v == null) return "—";
  return Number(v).toFixed(dp);
}

const MathPanel = memo(function MathPanel({ math, params }) {
  const m = math || {};
  const { k_att = 1.0, k_rep = 0.08, rho0 = 0.18, alpha = 0.005 } = params || {};

  const hasData = m.q_curr != null;

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      {/* ── Section: Position ─────────────────────────────────────── */}
      <div>
        <div className="text-[9px] font-semibold text-[#00D4FF]/80 uppercase tracking-widest mb-1.5">
          Robot State
        </div>
        <div className="bg-[#0D1117] border border-[#21262D] rounded-lg p-2.5 space-y-0.5">
          <Row label="q_curr" eq="current position"
               val={hasData ? fmt2(m.q_curr) : "[—, —]"}
               color="#00D4FF" />
          <Row label="q_next" eq="q_curr − α·∇U"
               val={hasData ? fmt2(m.q_next) : "[—, —]"}
               color="#00FF9F" />
          <div className="border-t border-[#21262D] mt-1.5 pt-1.5">
            <div className="text-[8.5px] font-mono text-[#6E7681]">
              Δ = {hasData && m.q_curr && m.q_next
                ? `[${(m.q_next[0]-m.q_curr[0]).toFixed(4)}, ${(m.q_next[1]-m.q_curr[1]).toFixed(4)}]`
                : "—"
              }
            </div>
          </div>
        </div>
      </div>

      {/* ── Section: Gradient Breakdown ───────────────────────────── */}
      <div>
        <div className="text-[9px] font-semibold text-[#00FF9F]/80 uppercase tracking-widest mb-1.5">
          Gradient ∇U
        </div>
        <div className="bg-[#0D1117] border border-[#21262D] rounded-lg p-2.5 space-y-0.5">
          <Row label="∇U_att" eq={`k_att·(q−goal) = ${k_att}·Δ`}
               val={hasData ? fmt2(m.grad_att) : "[—, —]"}
               color="#00D4FF" />
          <Row label="∇U_rep" eq="Σ k_rep·(1/ρ−1/ρ₀)·(q−obs)/ρ²"
               val={hasData ? fmt2(m.grad_rep) : "[—, —]"}
               color="#FF6B35" />
          <div className="border-t border-[#21262D] mt-1 pt-1">
            <Row label="∇U_tot" eq="∇U_att + ∇U_rep"
                 val={hasData ? fmt2(m.grad_tot) : "[—, —]"}
                 color="#FFD700" />
          </div>
        </div>
      </div>

      {/* ── Section: Potential Energy ──────────────────────────────── */}
      <div>
        <div className="text-[9px] font-semibold text-[#FFD700]/80 uppercase tracking-widest mb-1.5">
          Potential Energy U(q)
        </div>
        <div className="bg-[#0D1117] border border-[#21262D] rounded-lg p-2.5 space-y-0.5">
          <Row
            label="U_att"
            eq={`½·${k_att}·ρ²(q,goal)`}
            val={fmtN(m.u_att, 5)}
            color="#00D4FF"
          />
          <Row
            label="U_rep"
            eq={`Σ ½·${k_rep}·(1/ρ−1/${rho0})²`}
            val={fmtN(m.u_rep, 5)}
            color="#FF6B35"
          />
          <div className="border-t border-[#21262D] mt-1 pt-1">
            <Row label="U(q)" eq="U_att + U_rep"
                 val={fmtN(m.u_total, 5)} color="#FFD700" />
          </div>
        </div>
      </div>

      {/* ── Section: Update Step ──────────────────────────────────── */}
      <div>
        <div className="text-[9px] font-semibold text-[#7C3AED]/90 uppercase tracking-widest mb-1.5">
          Gradient Descent Step
        </div>
        <div className="bg-[#0D1117] border border-[#21262D] rounded-lg p-2.5">
          {/* Equation display */}
          <div className="text-[9px] font-mono text-[#8B949E] leading-relaxed">
            <div>q<sub>next</sub> = q<sub>curr</sub> − α · ∇U(q<sub>curr</sub>)</div>
            <div className="mt-0.5 text-[#6E7681]">
              = {hasData ? fmt2(m.q_curr) : "[—]"}
              <span className="text-[#8B949E]"> − {alpha}</span>
              <span className="text-[#FFD700]"> · {hasData ? fmt2(m.grad_tot) : "[—]"}</span>
            </div>
            <div className="mt-0.5 text-[#00FF9F]">
              = {hasData ? fmt2(m.q_next) : "[—]"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section: Parameters ───────────────────────────────────── */}
      <div>
        <div className="text-[9px] font-semibold text-[#8B949E]/70 uppercase tracking-widest mb-1.5">
          Parameters
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { sym: "k_att", val: k_att,  desc: "Attractive gain" },
            { sym: "k_rep", val: k_rep,  desc: "Repulsive gain"  },
            { sym: "ρ₀",    val: rho0,   desc: "Influence radius" },
            { sym: "α",     val: alpha,  desc: "Step size"       },
          ].map(p => (
            <div key={p.sym} className="bg-[#0D1117] border border-[#21262D] rounded-lg px-2 py-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-mono text-[#8B949E]">{p.sym}</span>
                <span className="text-[9px] font-mono text-[#00D4FF] font-semibold">{p.val}</span>
              </div>
              <div className="text-[8px] text-[#6E7681] mt-0.5">{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── LaTeX Reference ───────────────────────────────────────── */}
      <div className="bg-[#0D1117]/60 border border-[#21262D] rounded-lg p-2.5">
        <div className="text-[8.5px] font-mono text-[#8B949E] leading-[1.8]">
          <div className="text-[#00D4FF]/70 font-semibold text-[9px] mb-1">LaTeX Reference</div>
          <div>U(q) = <span className="text-[#00D4FF]">½k&#x208A;&#x209C;&#x209C;&#x03C1;²</span> + Σ <span className="text-[#FF6B35]">½k&#x1D523;&#x1D52;&#x1D529;(1/ρ−1/ρ₀)²</span></div>
          <div className="text-[#6E7681] text-[8px]">
            U_{"{att}"}(q)=\frac{"{"}1{"}"}{"{"}2{"}"}k_{"{att}"}\rho^2(q,q_{"{goal}"})
          </div>
          <div className="mt-0.5 text-[#6E7681] text-[8px]">
            q_{"{next}"}=q_{"{curr}"}-\alpha\nabla U(q_{"{curr}"})
          </div>
        </div>
      </div>
    </div>
  );
});

export default MathPanel;
