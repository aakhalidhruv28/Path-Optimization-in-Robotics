/**
 * CostSurface.jsx — 3D Cost Surface Plot
 * =========================================
 * Uses plotly.js-dist-min DIRECTLY (not react-plotly.js wrapper).
 * This avoids the Safari crash caused by react-plotly.js's internal
 * event binding. We call Plotly imperatively inside a useEffect.
 *
 * Update strategy:
 *  - First render: Plotly.newPlot()
 *  - Subsequent: Plotly.react() — only redraws diff, much faster than update()
 *  - surface data arrives at ~1 Hz from server (throttled)
 */

import { useEffect, useRef, memo } from "react";
import Plotly from "plotly.js-dist-min";

const DARK = "#0D1117";
const PANEL = "#161B22";
const BORDER = "#21262D";
const MUTED = "#8B949E";

const BASE_LAYOUT = {
  autosize:      true,
  margin:        { l: 0, r: 0, t: 28, b: 0 },
  paper_bgcolor: DARK,
  plot_bgcolor:  DARK,
  title: {
    text: "Cost Surface  U(q)",
    font: { color: MUTED, size: 12, family: "Inter, sans-serif" },
    x: 0.04,
  },
  scene: {
    bgcolor: DARK,
    xaxis: { title: { text: "x", font: { color: MUTED, size: 10 } }, tickfont: { color: MUTED, size: 8 }, gridcolor: BORDER, backgroundcolor: PANEL, showbackground: true },
    yaxis: { title: { text: "y", font: { color: MUTED, size: 10 } }, tickfont: { color: MUTED, size: 8 }, gridcolor: BORDER, backgroundcolor: PANEL, showbackground: true },
    zaxis: { title: { text: "U(q)", font: { color: MUTED, size: 10 } }, tickfont: { color: MUTED, size: 8 }, gridcolor: BORDER, backgroundcolor: PANEL, showbackground: true },
    camera: { eye: { x: 1.4, y: -1.4, z: 1.0 } },
  },
};

const CostSurface = memo(function CostSurface({ surface }) {
  const divRef   = useRef(null);
  const readyRef = useRef(false);

  useEffect(() => {
    const el = divRef.current;
    if (!el || !surface || surface.length === 0) return;

    const n  = surface[0].length;
    const m  = surface.length;
    const xs = Array.from({ length: n }, (_, i) => +(i / (n - 1)).toFixed(2));
    const ys = Array.from({ length: m }, (_, i) => +(i / (m - 1)).toFixed(2));

    const traceData = [{
      type:        "surface",
      z:            surface,
      x:            xs,
      y:            ys,
      colorscale:  "Viridis",
      reversescale: true,         // blue = low cost (goal valley), yellow = peaks
      showscale:    true,
      colorbar: {
        title:    { text: "U(q)", font: { color: MUTED, size: 11 } },
        tickfont: { color: MUTED, size: 9 },
        len: 0.65, thickness: 10,
      },
      contours: { z: { show: true, usecolormap: true, project: { z: true } } },
      opacity: 0.93,
    }];

    if (!readyRef.current) {
      // First render — initialize
      Plotly.newPlot(el, traceData, BASE_LAYOUT, {
        responsive:      true,
        displayModeBar: false,
      });
      readyRef.current = true;
    } else {
      // Efficient update — Plotly.react only re-renders what changed
      Plotly.react(el, traceData, BASE_LAYOUT);
    }
  }, [surface]);

  return (
    <div
      ref={divRef}
      style={{ width: "100%", height: "100%" }}
      id="plotly-surface"
    />
  );
});

export default CostSurface;
