import React, { useState } from "react";
import StationsModal from "@/components/StationsModal";

// TEMPORARY gate-free preview of the multi-station Broadcast Center so the owner
// can see the UI without entering an activation key. Uses demo data + no-op
// handlers. Reachable at /broadcast-preview. Safe to remove later.
const DEMO = [
  {
    id: "hotlive95",
    name: "Hot Live 95",
    tagline: "Detroit · A.I. Radio",
    color: "#ff5a1f",
    logo: "/hl-emblem.png",
    host: "s2.ssl-stream.com",
    port: 8265,
    password: "demo",
    username: "DJ_D_In_The_Streets",
    mount: "/",
    bitrate: 128,
    includeMic: true,
    streamUrl: "https://s2.ssl-stream.com/listen/hotlive95/radio.mp3",
    statusUrl: "https://s2.ssl-stream.com/api/nowplaying/hotlive95",
  },
  {
    id: "oldschool",
    name: "Hot Live 95 · Old School",
    tagline: "Throwback Channel",
    color: "#22c1c3",
    logo: "/hl-emblem.png",
    host: "s2.ssl-stream.com",
    port: 8266,
    password: "",
    username: "source",
    mount: "/",
    bitrate: 128,
    includeMic: true,
    streamUrl: "",
    statusUrl: "",
  },
];

export default function BroadcastPreview() {
  const [stations, setStations] = useState(DEMO);
  const noop = () => {};
  return (
    <div className="hl-app-bg min-h-screen" data-testid="broadcast-preview">
      <StationsModal
        stations={stations}
        setStations={setStations}
        bcStations={{ hotlive95: { state: "live", error: "", reconnect: null } }}
        onAir={noop}
        onAirAll={noop}
        onStop={noop}
        onStopAll={noop}
        onTest={async () => ({ ok: true, reachable: true, status: "ready", message: "Preview: server accepted your login — clear to go live." })}
        getLevel={() => Math.random() * 0.5 + 0.3}
        getHealth={() => ({ kbps: 128, buffered: 1400, drops: 0, status: "good" })}
        metaFormat="{artist} - {title}"
        onMetaFormat={noop}
        broadcasts={[]}
        onDownloadBroadcast={noop}
        onDeleteBroadcast={noop}
        onArchiveToPlaylist={noop}
        onClose={() => {
          window.location.href = "/";
        }}
      />
    </div>
  );
}
