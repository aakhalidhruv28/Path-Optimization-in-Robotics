import Canvas2D from "./Canvas2D";

const PARAMS = [
  { key: "k_att", val: "1.0" },
  { key: "k_rep", val: "0.08" },
  { key: "ρ₀", val: "0.18" },
  { key: "α", val: "0.005" },
];

const GUIDES = [
  { icon: "⬤→⬤", label: "Drag Start / Goal", color: "#00FF9F" },
  { icon: "✏",    label: "Click & Drag to Paint Obstacles", color: "#FF6B35" },
  { icon: "✕",    label: "Button to Clear", color: "#8B949E" },
];

export default function Sandbox({ path, onStartChange, onGoalChange, onObstaclesChange }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>APF Sandbox</div>
          <div style={{ fontSize: 11, color: "#8B949E", marginTop: 2 }}>
            Drag markers · Paint obstacles · Watch gradient descent
          </div>
        </div>
        {/* Param badges */}
        <div style={{ display: "flex", gap: 6 }}>
          {PARAMS.map(p => (
            <span key={p.key} style={{
              fontSize: 10, fontFamily: "monospace", color: "#8B949E",
              background: "#0D1117", border: "1px solid #21262D",
              padding: "3px 8px", borderRadius: 6,
            }}>
              {p.key}={p.val}
            </span>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div style={{
        borderRadius: 12, overflow: "hidden",
        border: "1px solid #21262D",
        boxShadow: "0 0 30px rgba(0,212,255,0.06)",
      }}>
        <Canvas2D
          path={path}
          onStartChange={onStartChange}
          onGoalChange={onGoalChange}
          onObstaclesChange={onObstaclesChange}
        />
      </div>

      {/* Interaction guide */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {GUIDES.map(g => (
          <div key={g.label} style={{
            background: "#0D1117", border: "1px solid #21262D", borderRadius: 8,
            padding: "8px 12px", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 4, textAlign: "center",
          }}>
            <span style={{ fontSize: 18, color: g.color }}>{g.icon}</span>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "#8B949E" }}>{g.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
