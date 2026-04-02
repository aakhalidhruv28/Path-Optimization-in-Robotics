import { memo } from "react";

const METRICS = [
  { id: "dist",  icon: "⟶", label: "Distance to Goal",   unit: "units", color: "#00D4FF", glow: "rgba(0,212,255,.12)" },
  { id: "grad",  icon: "∇",  label: "Gradient Magnitude", unit: "‖∇U‖",  color: "#00FF9F", glow: "rgba(0,255,159,.12)" },
  { id: "cost",  icon: "∫",  label: "Total Energy Cost",  unit: "U(q)",  color: "#FFD700", glow: "rgba(255,215,0,.12)"  },
];

const Telemetry = memo(function Telemetry({ distance, velocity, totalCost, connected }) {
  const values = [
    (distance  || 0).toFixed(3),
    (velocity  || 0).toFixed(5),
    (totalCost || 0).toFixed(4),
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[#8B949E] uppercase tracking-widest">
          Live Telemetry
        </span>
        <span className={`flex items-center gap-1.5 text-[9px] font-mono px-2 py-0.5 rounded-full border ${
          connected
            ? "border-[#00FF9F]/30 bg-[#00FF9F]/08 text-[#00FF9F]"
            : "border-red-500/30 bg-red-500/08 text-red-400"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#00FF9F] animate-pulse" : "bg-red-400"}`}/>
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      {/* Metric cards */}
      {METRICS.map((m, i) => (
        <div key={m.id} id={`metric-${m.id}`}
          className="flex items-center justify-between bg-[#0D1117] border border-[#21262D] rounded-lg px-3 py-2"
          style={{ boxShadow: `0 0 10px ${m.glow}` }}>
          <div className="flex items-center gap-2.5">
            <span style={{ color: m.color, fontSize: 15, fontFamily: "monospace", width: 18, textAlign: "center" }}>{m.icon}</span>
            <div>
              <div className="text-[10px] text-[#8B949E] font-medium">{m.label}</div>
              <div className="text-[9px] font-mono text-[#8B949E]/50">{m.unit}</div>
            </div>
          </div>
          <span style={{ color: m.color }} className="text-base font-mono font-semibold tabular-nums">{values[i]}</span>
        </div>
      ))}

      {/* Math equations */}
      <div className="p-2.5 bg-[#0D1117]/60 border border-[#21262D] rounded-lg text-[9px] font-mono text-[#8B949E] leading-relaxed">
        <p className="text-[#00D4FF]/80 font-semibold mb-0.5">APF Equations</p>
        <p>U<sub>att</sub>(q) = ½·k<sub>att</sub>·ρ²(q,q<sub>goal</sub>)</p>
        <p>U<sub>rep</sub>(q) = Σ ½·k<sub>rep</sub>·(1/ρ−1/ρ₀)²</p>
        <p className="text-[#00FF9F]/80">q<sub>next</sub> = q<sub>curr</sub> − α·∇U(q)</p>
      </div>
    </div>
  );
});

export default Telemetry;
