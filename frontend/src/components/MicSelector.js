import React, { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { listMics, getPreferredMicId, setPreferredMicId, autoBluetoothMic, isBluetoothLabel } from "@/lib/mic";

// Dropdown of AVAILABLE microphones only. Auto-selects a connected Bluetooth mic
// when the DJ hasn't chosen one, and re-checks whenever devices change.
export default function MicSelector({ onChange }) {
  const [mics, setMics] = useState([]);
  const [value, setValue] = useState(getPreferredMicId());
  const askedRef = useRef(false);

  const refresh = async () => {
    // Labels are only exposed after mic permission is granted — ask once.
    if (!askedRef.current) {
      askedRef.current = true;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        /* user may deny — we still list without labels */
      }
    }
    const list = await listMics();
    setMics(list);
    const chosen = getPreferredMicId();
    const stillThere = chosen && list.some((m) => m.deviceId === chosen);
    if (!stillThere) {
      const bt = autoBluetoothMic(list);
      const pick = bt ? bt.deviceId : "";
      setPreferredMicId(pick);
      setValue(pick);
      onChange && onChange(pick);
    } else {
      setValue(chosen);
    }
  };

  useEffect(() => {
    refresh();
    const md = navigator.mediaDevices;
    if (md && md.addEventListener) md.addEventListener("devicechange", refresh);
    return () => {
      if (md && md.removeEventListener) md.removeEventListener("devicechange", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (id) => {
    setValue(id);
    setPreferredMicId(id);
    onChange && onChange(id);
  };

  const activeLabel = mics.find((m) => m.deviceId === value)?.label || "";
  const bt = value && isBluetoothLabel(activeLabel);

  return (
    <div className="flex items-center gap-1.5" title="Choose which microphone the studio uses">
      <Mic size={15} className={bt ? "text-[var(--hl-cue)]" : "text-[var(--hl-muted)]"} />
      <select
        data-testid="mic-selector"
        value={value}
        onChange={(e) => pick(e.target.value)}
        className="hl-input !py-1 !w-auto max-w-[180px] text-xs"
      >
        {mics.length === 0 && <option value="">No microphone found</option>}
        {mics.length > 0 && <option value="">Default microphone</option>}
        {mics.map((m) => (
          <option key={m.deviceId} value={m.deviceId}>
            {isBluetoothLabel(m.label) ? "🎧 " : ""}
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
