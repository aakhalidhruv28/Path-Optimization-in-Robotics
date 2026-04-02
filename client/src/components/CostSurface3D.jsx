/**
 * CostSurface3D.jsx — Plotly.js 3D Cost Surface Visualization
 * =============================================================
 * Renders the APF cost function U(q) as a 3D surface plot.
 * The goal appears as a deep valley (low cost) and obstacles appear
 * as sharp mountains (high repulsive cost).
 */

import Plot from "react-plotly.js";
import { useMemo } from "react";

export default function CostSurface3D({ costSurface }) {
  // Build axis tick values for a 0..1 normalized grid
  const axisVals = useMemo(() => {
    if (!costSurface || costSurface.length === 0) return { x: [], y: [] };
    const n = costSurface[0].length;
    const m = costSurface.length;
    return {
      x: Array.from({ length: n }, (_, i) => +(i / (n - 1)).toFixed(2)),
      y: Array.from({ length: m }, (_, i) => +(i / (m - 1)).toFixed(2)),
    };
  }, [costSurface]);

  const data = [
    {
      type: "surface",
      z: costSurface,
      x: axisVals.x,
      y: axisVals.y,
      // ── Viridis colorscale: blue=low cost (goal valley), yellow=high (obstacle mountains)
      colorscale: "Viridis",
      reversescale: true,     // Blue = low (valley at goal), yellow = high (obstacle)
      showscale: true,
      colorbar: {
        title: { text: "U(q)", font: { color: "#8B949E", size: 11 } },
        tickfont: { color: "#8B949E", size: 10 },
        len: 0.7,
        thickness: 12,
      },
      // Smooth surface appearance
      contours: {
        z: { show: true, usecolormap: true, highlightcolor: "#00D4FF", project: { z: true } },
      },
      opacity: 0.92,
      hovertemplate: "x: %{x:.2f}<br>y: %{y:.2f}<br>U(q): %{z:.3f}<extra></extra>",
    },
  ];

  const layout = {
    autosize: true,
    margin: { l: 0, r: 0, t: 30, b: 0 },
    paper_bgcolor: "#0D1117",
    plot_bgcolor:  "#0D1117",

    scene: {
      bgcolor: "#0D1117",
      xaxis: {
        title: { text: "x", font: { color: "#8B949E", size: 11 } },
        tickfont: { color: "#8B949E", size: 9 },
        gridcolor:    "#21262D",
        zerolinecolor:"#21262D",
        backgroundcolor: "#161B22",
        showbackground: true,
      },
      yaxis: {
        title: { text: "y", font: { color: "#8B949E", size: 11 } },
        tickfont: { color: "#8B949E", size: 9 },
        gridcolor:    "#21262D",
        zerolinecolor:"#21262D",
        backgroundcolor: "#161B22",
        showbackground: true,
      },
      zaxis: {
        title: { text: "U(q)", font: { color: "#8B949E", size: 11 } },
        tickfont: { color: "#8B949E", size: 9 },
        gridcolor:    "#21262D",
        zerolinecolor:"#21262D",
        backgroundcolor: "#161B22",
        showbackground: true,
      },
      // Camera angle for a good default view of the cost landscape
      camera: {
        eye: { x: 1.4, y: -1.4, z: 1.0 },
        up:  { x: 0,   y: 0,    z: 1   },
      },
    },

    title: {
      text: "APF Cost Surface  U(q) = U<sub>att</sub> + U<sub>rep</sub>",
      font: { color: "#8B949E", size: 13, family: "Inter, sans-serif" },
      x: 0.05,
    },
  };

  const config = {
    displayModeBar: true,
    modeBarButtonsToRemove: ["sendDataToCloud", "lasso2d", "select2d"],
    displaylogo: false,
    responsive: true,
    toImageButtonOptions: { filename: "apf_cost_surface" },
  };

  if (!costSurface || costSurface.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-brand-muted text-sm font-mono">
        Waiting for server data…
      </div>
    );
  }

  return (
    <Plot
      data={data}
      layout={layout}
      config={config}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
    />
  );
}
