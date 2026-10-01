import React, { useEffect, useRef, useState } from "react";

const toDb = (v) => (v <= 0.0001 ? -Infinity : 20 * Math.log10(v));
const fmtDb = (db) => (db === -Infinity ? "-\u221E" : `${db > 0 ? "+" : ""}${db.toFixed(1)}`);

// On-air stereo VU/level meter. Polls engine.getProgramLevels() each frame and
// renders two smoothed bars (L/R) with peak-hold, a numeric dB readout, and a
// clip light that latches briefly and flashes when you hold in the red.
export default function VuMeter({ getLevels, className = "", compact = false, showDb = true, showLufs = false }) {
  const [state, setState] = useState({ l: 0, r: 0, lHold: 0, rHold: 0, db: -Infinity, lufs: -Infinity, clip: false, held: false });
  const pRef = useRef({ l: 0, r: 0, lHold: 0, rHold: 0, lufs: -Infinity });
  const holdTsRef = useRef({ l: 0, r: 0 });
  const clipRef = useRef({ latchUntil: 0, redSince: 0 });
  const rafRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      const lv = (getLevels && getLevels()) || { l: 0, r: 0 };
      const now = performance.now();
      const p = pRef.current;
      p.l = lv.l > p.l ? lv.l : p.l * 0.82 + lv.l * 0.18;
      p.r = lv.r > p.r ? lv.r : p.r * 0.82 + lv.r * 0.18;
      const setHold = (ch, v) => {
        const key = ch === "lHold" ? "l" : "r";
        if (v >= p[ch]) {
          p[ch] = v;
          holdTsRef.current[key] = now;
        } else if (now - holdTsRef.current[key] > 800) {
          p[ch] = Math.max(v, p[ch] - 0.01);
        }
      };
      setHold("lHold", lv.l);
      setHold("rHold", lv.r);

      // Clip detection: latch the light ~1.2s after any clip; flag "held" when
      // the signal stays in the red for over a second.
      const inst = Math.max(lv.l, lv.r);
      const c = clipRef.current;
      if (inst > 0.97) {
        c.latchUntil = now + 1200;
        if (!c.redSince) c.redSince = now;
      } else {
        c.redSince = 0;
      }
      const clip = now < c.latchUntil;
      const held = !!c.redSince && now - c.redSince > 1000;

      // Smooth the momentary LUFS reading.
      const rawLufs = typeof lv.lufs === "number" ? lv.lufs : -Infinity;
      if (rawLufs === -Infinity || !isFinite(rawLufs)) {
        p.lufs = p.lufs === -Infinity ? -Infinity : p.lufs - 2;
        if (p.lufs < -60) p.lufs = -Infinity;
      } else {
        p.lufs = p.lufs === -Infinity ? rawLufs : p.lufs * 0.8 + rawLufs * 0.2;
      }

      setState({
        l: p.l,
        r: p.r,
        lHold: p.lHold,
        rHold: p.rHold,
        db: toDb(Math.max(p.l, p.r)),
        lufs: p.lufs,
        clip,
        held,
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [getLevels]);

  const Bar = ({ value, hold, label }) => {
    const pct = Math.min(100, value * 100);
    const holdPct = Math.min(100, (hold || 0) * 100);
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-mono text-[var(--hl-muted)] w-2">{label}</span>
        <div className={`relative flex-1 ${compact ? "h-1.5" : "h-2.5"} rounded-full bg-black/50 overflow-hidden border border-[var(--hl-line)]`}>
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg,#22c55e 0%,#22c55e 62%,#f5c542 80%,#ff5a1f 92%,#ff1744 100%)",
            }}
          />
          {holdPct > 1 && <div className="absolute inset-y-0 w-[2px] bg-white/90" style={{ left: `calc(${holdPct}% - 1px)` }} />}
        </div>
      </div>
    );
  };

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="vu-meter">
      <div className="flex-1 space-y-1">
        <Bar value={state.l} hold={state.lHold} label="L" />
        <Bar value={state.r} hold={state.rHold} label="R" />
      </div>
      {/* Clip / peak warning light */}
      <div
        data-testid="vu-clip"
        title={state.held ? "Holding in the red — pull the level down" : state.clip ? "Peak clip" : "Level OK"}
        className={`shrink-0 rounded-full border transition-colors ${compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} ${
          state.clip
            ? `bg-[var(--hl-onair)] border-[var(--hl-onair)] shadow-[0_0_8px_var(--hl-onair)] ${state.held ? "animate-pulse" : ""}`
            : "bg-transparent border-[var(--hl-line)]"
        }`}
      />
      {showDb && !compact && (
        <span
          data-testid="vu-db"
          className={`font-mono text-[11px] w-12 text-right tabular-nums ${state.clip ? "text-[var(--hl-onair)]" : "text-[var(--hl-muted)]"}`}
        >
          {state.clip && state.held ? "CLIP" : fmtDb(state.db)}
          {!(state.clip && state.held) && <span className="text-[8px] ml-0.5 opacity-70">dB</span>}
        </span>
      )}
      {showLufs && !compact && (
        <span
          data-testid="vu-lufs"
          className="font-mono text-[11px] w-20 text-right tabular-nums text-[var(--hl-cue)]"
          title="Momentary program loudness (approx LUFS)"
        >
          {state.lufs === -Infinity || !isFinite(state.lufs) ? "-\u221E" : state.lufs.toFixed(1)}
          <span className="text-[8px] ml-0.5 opacity-70">LUFS</span>
        </span>
      )}
    </div>
  );
}
