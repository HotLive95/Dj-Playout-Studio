import React, { useEffect, useRef } from "react";

// Canvas waveform. All region/point props are fractions (0..1) of duration.
export default function Waveform({
  peaks,
  progress = 0,
  inPoint = 0,
  outPoint = 1,
  cuts = [],
  markers = [],
  height = 96,
  onSeek,
  interactive = true,
  compact = false,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const n = peaks.length;
    const barW = w / n;

    // trimmed-out (before in / after out) drawn dim
    for (let i = 0; i < n; i++) {
      const frac = i / n;
      const x = i * barW;
      const amp = Math.max(1, peaks[i] * (h * 0.46));
      const inTrim = frac < inPoint || frac > outPoint;
      const inCut = cuts.some((c) => frac >= c.start && frac <= c.end);
      const played = frac <= progress;
      if (inCut) ctx.fillStyle = "#5a1a12";
      else if (inTrim) ctx.fillStyle = "#33333a";
      else if (played) ctx.fillStyle = compact ? "#ff7a3d" : "#ffab00";
      else ctx.fillStyle = "#ff5a1f";
      ctx.fillRect(x, mid - amp, Math.max(1, barW - 0.5), amp * 2);
    }

    // playhead
    if (progress > 0 && progress < 1) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(progress * w - 1, 0, 2, h);
    }
  }, [peaks, progress, inPoint, outPoint, cuts, height, compact]);

  const handleClick = (e) => {
    if (!interactive || !onSeek) return;
    const r = wrapRef.current.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };

  return (
    <div
      ref={wrapRef}
      onClick={handleClick}
      className={`relative w-full ${interactive ? "cursor-pointer" : ""}`}
      style={{ height }}
      data-testid="waveform"
    >
      <canvas ref={canvasRef} />
      {markers.map((m, i) => (
        <div
          key={`mk-${i}`}
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: `${m.frac * 100}%`, width: 2, background: m.color }}
          data-testid={`wave-marker-${m.label || i}`}
        />
      ))}
      {/* trim handles */}
      {!compact && (
        <>
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-[var(--hl-amber)]"
            style={{ left: `${inPoint * 100}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-[var(--hl-amber)]"
            style={{ left: `${outPoint * 100}%` }}
          />
        </>
      )}
    </div>
  );
}
