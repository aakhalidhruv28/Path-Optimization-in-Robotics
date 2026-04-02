/**
 * useWebSocket.js — Stable WebSocket (zero reconnect cycles)
 * ===========================================================
 *
 * ROOT CAUSE OF OFFLINE FLICKERING:
 * ----------------------------------
 * When useEffect's dependency array includes a function (like setServerPath),
 * React re-runs the effect every time that function's reference changes.
 * Since setServerPath was defined inside useAPFCanvas without useCallback,
 * it was a NEW function on every render. App re-renders at 20Hz from
 * setTelemetry → new setServerPath → useEffect reruns → WebSocket CLOSES.
 *
 * FIX: Store all callbacks in a ref (cbRef). The useEffect only depends on
 * nothing (empty array), so it runs ONCE on mount and NEVER reconnects due
 * to parent re-renders. cbRef.current always has the latest function, so
 * no stale closure issues either.
 */

import { useEffect, useRef, useState, useCallback } from "react";

const WS_URL   = "ws://localhost:8000/ws";
const RETRY_MS = 2000;

export function useWebSocket(setServerPath, onSurface, setMath) {
  const wsRef    = useRef(null);
  const pending  = useRef(null);    // latest JSON to send
  const rafRef   = useRef(null);

  // ── Stable callback mirror — updated every render, zero identity cost ──
  // useEffect closure always reads cbRef.current so it NEVER goes stale,
  // but the effect itself has an EMPTY dep array → runs once → stable WS.
  const cbRef = useRef({ setServerPath, onSurface, setMath });
  useEffect(() => {
    cbRef.current = { setServerPath, onSurface, setMath };
  });

  const [connected, setConnected] = useState(false);
  const [telemetry, setTelemetry] = useState({
    distance: 0, velocity: 0, total_cost: 0,
  });

  // RAF send loop — fires every frame, sends latest pending state
  const flushLoop = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && pending.current !== null) {
      ws.send(pending.current);
      pending.current = null;
    }
    rafRef.current = requestAnimationFrame(flushLoop);
  }, []); // stable — empty deps

  // ── Main effect — runs ONCE on mount ──────────────────────────────────
  useEffect(() => {
    let retryTimer = null;
    let alive      = true;   // set false on unmount to stop retries

    function connect() {
      if (!alive) return;

      let ws;
      try { ws = new WebSocket(WS_URL); }
      catch (_) {
        if (alive) retryTimer = setTimeout(connect, RETRY_MS);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        rafRef.current = requestAnimationFrame(flushLoop);
        // Send initial scene so server computes a path immediately
        pending.current = JSON.stringify({
          start: [0.1, 0.5], goal: [0.9, 0.5], obstacles: [],
        });
      };

      ws.onmessage = ({ data }) => {
        try {
          const d = JSON.parse(data);
          const { setServerPath, onSurface, setMath } = cbRef.current;

          // Path → canvas ref DIRECTLY — zero React state, zero re-render
          if (d.path?.length >= 2) setServerPath(d.path);

          // Surface — server only sends this every ~500 ms
          if (d.cost_surface?.length) onSurface(d.cost_surface);

          // Math step data
          if (d.math) setMath(d.math);

          // Telemetry — small object, fine to setState
          setTelemetry({
            distance:   d.distance   ?? 0,
            velocity:   d.velocity   ?? 0,
            total_cost: d.total_cost ?? 0,
          });
        } catch (e) {
          console.error("WS parse:", e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        cancelAnimationFrame(rafRef.current);
        if (alive) retryTimer = setTimeout(connect, RETRY_MS);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      alive = false;
      clearTimeout(retryTimer);
      cancelAnimationFrame(rafRef.current);
      wsRef.current?.close();
    };
  }, []); // ← EMPTY: effect runs once, NEVER re-runs due to prop changes

  const sendScene = useCallback((scene) => {
    pending.current = JSON.stringify(scene);
  }, []); // stable

  return { connected, telemetry, sendScene };
}
