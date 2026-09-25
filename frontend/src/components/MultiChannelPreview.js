import React from "react";
import MultiChannelStudio from "@/components/MultiChannelStudio";

// TEMPORARY gate-free demo of the Multi-Channel Studio so the owner can see (and
// HEAR) different programs airing on different channels at once. Uses bundled demo
// audio clips (distinct tones) so playback works without a track library.
// Reachable at /multichannel-preview. Safe to remove later.
const DEMO_PLAYLISTS = [
  { id: "pl_house", name: "House Set", items: [
    { id: "d1", url: "/demo/ch1.mp3", title: "Deep Groove (196Hz)", artist: "House Set" },
    { id: "d3", url: "/demo/ch3.mp3", title: "Warehouse (262Hz)", artist: "House Set" },
  ]},
  { id: "pl_throwback", name: "Throwbacks", items: [
    { id: "d2", url: "/demo/ch2.mp3", title: "Old School (330Hz)", artist: "Throwbacks" },
    { id: "d4", url: "/demo/ch4.mp3", title: "Golden Era (440Hz)", artist: "Throwbacks" },
  ]},
  { id: "pl_talk", name: "Talk / News", items: [
    { id: "d3b", url: "/demo/ch3.mp3", title: "Morning Show (262Hz)", artist: "Talk / News" },
    { id: "d1b", url: "/demo/ch1.mp3", title: "City Desk (196Hz)", artist: "Talk / News" },
  ]},
  { id: "pl_chill", name: "Chill", items: [
    { id: "d4b", url: "/demo/ch4.mp3", title: "Sunset (440Hz)", artist: "Chill" },
    { id: "d2b", url: "/demo/ch2.mp3", title: "Late Night (330Hz)", artist: "Chill" },
  ]},
];

const DEMO_STATIONS = [
  { id: "hotlive95", name: "Hot Live 95", color: "#ff5a1f", logo: "/hl-emblem.png", bitrate: 128, defaultPlaylistId: "pl_house",
    host: "s2.ssl-stream.com", port: 8265, password: "demo", username: "DJ_D_In_The_Streets", mount: "/", streamUrl: "https://s2.ssl-stream.com/listen/hotlive95/radio.mp3" },
  { id: "oldschool", name: "Old School", color: "#22c1c3", logo: "/hl-emblem.png", bitrate: 128, defaultPlaylistId: "pl_throwback",
    host: "s2.ssl-stream.com", port: 8266, password: "demo", username: "source", mount: "/" },
  { id: "talk", name: "Talk 95", color: "#a78bfa", logo: "/hl-emblem.png", bitrate: 128, defaultPlaylistId: "pl_talk",
    host: "s2.ssl-stream.com", port: 8267, password: "demo", username: "source", mount: "/" },
  { id: "chill", name: "Chill 95", color: "#f59e0b", logo: "/hl-emblem.png", bitrate: 128, defaultPlaylistId: "pl_chill",
    host: "s2.ssl-stream.com", port: 8268, password: "demo", username: "source", mount: "/" },
];

export default function MultiChannelPreview() {
  return (
    <div className="hl-app-bg min-h-screen">
      <MultiChannelStudio
        stations={DEMO_STATIONS}
        playlists={DEMO_PLAYLISTS}
        tracks={{}}
        onClose={() => {
          window.location.href = "/";
        }}
      />
    </div>
  );
}
