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
  onInChange,
  onOutChange,
  onCueDrag,
  interactive = true,
  compact = false,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const draggingRef = useRef(null);

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
    if (draggingRef.current) return;
    if (!interactive || !onSeek) return;
    const r = wrapRef.current.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };

  const fracFromX = (clientX) => {
    const r = wrapRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  const startHandleDrag = (which) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = which;
    const move = (ev) => {
      const f = fracFromX(ev.clientX);
      if (which === "in" && onInChange) onInChange(Math.min(f, outPoint - 0.001));
      if (which === "out" && onOutChange) onOutChange(Math.max(f, inPoint + 0.001));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setTimeout(() => {
        draggingRef.current = null;
      }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startCueDrag = (label) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = label;
    const move = (ev) => {
      if (onCueDrag) onCueDrag(label, fracFromX(ev.clientX));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setTimeout(() => {
        draggingRef.current = null;
      }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const draggable = !compact && (onInChange || onOutChange);

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
      {/* draggable cue handles on the compact seek bar */}
      {compact &&
        onCueDrag &&
        markers
          .filter((m) => m.label === "in" || m.label === "out")
          .map((m) => (
            <div
              key={`cue-${m.label}`}
              data-testid={`cue-handle-${m.label}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={startCueDrag(m.label)}
              className="absolute top-0 bottom-0 z-20 cursor-ew-resize touch-none"
              style={{ left: `${m.frac * 100}%`, width: 14, marginLeft: -7 }}
            >
              <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px]"
                style={{ background: m.color }}
              />
              <div
                className="absolute -top-1 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full"
                style={{ background: m.color }}
              />
            </div>
          ))}
      {/* trim handles */}
      {!compact && (
        <>
          <div
            data-testid="trim-handle-in"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={draggable ? startHandleDrag("in") : undefined}
            className={`absolute top-0 bottom-0 z-10 ${draggable ? "cursor-ew-resize touch-none" : ""}`}
            style={{ left: `${inPoint * 100}%`, width: draggable ? 16 : 2, marginLeft: draggable ? -8 : 0 }}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-[var(--hl-amber)]" />
            {draggable && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-3 w-3 rounded-b-sm bg-[var(--hl-amber)]" />
            )}
          </div>
          <div
            data-testid="trim-handle-out"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={draggable ? startHandleDrag("out") : undefined}
            className={`absolute top-0 bottom-0 z-10 ${draggable ? "cursor-ew-resize touch-none" : ""}`}
            style={{ left: `${outPoint * 100}%`, width: draggable ? 16 : 2, marginLeft: draggable ? -8 : 0 }}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-[var(--hl-amber)]" />
            {draggable && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-3 w-3 rounded-t-sm bg-[var(--hl-amber)]" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
