import React, { useEffect, useRef, useState } from "react";

// On-air stereo VU/level meter. Polls engine.getProgramLevels() each frame and
// renders two smoothed bars (L/R) with a peak-hold marker. Shows a dim idle
// state when there's no on-air signal yet.
export default function VuMeter({ getLevels, className = "", compact = false }) {
  const [db, setDb] = useState({ l: 0, r: 0 });
  const peakRef = useRef({ l: 0, r: 0, lHold: 0, rHold: 0 });
  const rafRef = useRef(null);
  const holdTsRef = useRef({ l: 0, r: 0 });

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      const lv = (getLevels && getLevels()) || { l: 0, r: 0 };
      const now = performance.now();
      const p = peakRef.current;
      // Fast attack, slow release for a natural VU feel.
      p.l = lv.l > p.l ? lv.l : p.l * 0.82 + lv.l * 0.18;
      p.r = lv.r > p.r ? lv.r : p.r * 0.82 + lv.r * 0.18;
      if (lv.l >= p.lHold) {
        p.lHold = lv.l;
        holdTsRef.current.l = now;
      } else if (now - holdTsRef.current.l > 800) {
        p.lHold = Math.max(lv.l, p.lHold - 0.01);
      }
      if (lv.r >= p.rHold) {
        p.rHold = lv.r;
        holdTsRef.current.r = now;
      } else if (now - holdTsRef.current.r > 800) {
        p.rHold = Math.max(lv.r, p.rHold - 0.01);
      }
      setDb({ l: p.l, r: p.r, lHold: p.lHold, rHold: p.rHold });
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
    const clip = value > 0.97;
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-mono text-[var(--hl-muted)] w-2">{label}</span>
        <div className={`relative flex-1 ${compact ? "h-1.5" : "h-2.5"} rounded-full bg-black/50 overflow-hidden border border-[var(--hl-line)]`}>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg,#22c55e 0%,#22c55e 62%,#f5c542 80%,#ff5a1f 92%,#ff1744 100%)",
            }}
          />
          {holdPct > 1 && (
            <div
              className="absolute inset-y-0 w-[2px] bg-white/90"
              style={{ left: `calc(${holdPct}% - 1px)` }}
            />
          )}
          {clip && <div className="absolute inset-0 bg-[var(--hl-onair)]/30" />}
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-1 ${className}`} data-testid="vu-meter">
      <Bar value={db.l} hold={db.lHold} label="L" />
      <Bar value={db.r} hold={db.rHold} label="R" />
    </div>
  );
}
