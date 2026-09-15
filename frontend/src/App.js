import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "@/App.css";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import TrackList from "@/components/TrackList";
import PlayerBar from "@/components/PlayerBar";
import CuePanel from "@/components/CuePanel";
import TrackEditor from "@/components/TrackEditor";
import ScheduleModal from "@/components/ScheduleModal";
import AudioEngine from "@/lib/audioEngine";
import { platform } from "@/lib/platform";
import { putBlob } from "@/lib/db";
import { decodeToBuffer, detectSilence } from "@/lib/audioProcessing";

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const defaultSettings = {
  autoplay: true,
  crossfade: true,
  crossfadeSeconds: 3,
  volume: 1,
  programSink: "",
  cueSink: "",
  trimSilence: false,
  autoDuck: false,
};

function readDuration(src) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve(audio.duration || 0);
    audio.onerror = () => resolve(0);
    audio.src = src;
  });
}

const blobToB64 = (blob) =>
  new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.readAsDataURL(blob);
  });

const b64ToBlob = (b64, type) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
};

function App() {
  const [tracks, setTracks] = useState({});
  const [playlists, setPlaylists] = useState([]);
  const [currentPlaylistId, setCurrentPlaylistId] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [playback, setPlayback] = useState({ isPlaying: false, currentTime: 0, duration: 0 });
  const [cue, setCue] = useState({ trackId: null, isPlaying: false, currentTime: 0, duration: 0 });
  const [devices, setDevices] = useState([]);

  const [editorTrack, setEditorTrack] = useState(null);
  const [scheduleForId, setScheduleForId] = useState(null);
  const [talkActive, setTalkActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [banner, setBanner] = useState("");

  const engineRef = useRef(null);
  const micRef = useRef({ active: false });
  const schedRef = useRef({ start: {}, end: {} });
  const [autoStartPending, setAutoStartPending] = useState(null);

  // ---- Load persisted state ----
  useEffect(() => {
    (async () => {
      const state = await platform.loadState();
      if (state) {
        setTracks(state.tracks || {});
        setPlaylists(state.playlists || []);
        setCurrentPlaylistId(state.currentPlaylistId || state.playlists?.[0]?.id || null);
        setSettings({ ...defaultSettings, ...(state.settings || {}), autoDuck: false });
      }
      setLoaded(true);
    })();
  }, []);

  // ---- Audio engine ----
  useEffect(() => {
    const engine = new AudioEngine(
      (s) => {
        setPlayback({ isPlaying: s.isPlaying, currentTime: s.currentTime, duration: s.duration });
        const t = engine.queue[s.index];
        setCurrentTrackId(t ? t.id : null);
      },
      (c) => setCue(c)
    );
    engineRef.current = engine;
    return () => engine.destroy();
  }, []);

  // ---- Apply settings to engine ----
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setAutoplay(settings.autoplay);
    e.setCrossfade(settings.crossfade, settings.crossfadeSeconds);
    e.setVolume(settings.volume);
    e.setMainSink(settings.programSink || "");
    e.setCueSink(settings.cueSink || "");
    e.setTrimSilence(settings.trimSilence);
  }, [settings]);

  // ---- Ducking (manual Talk + mic auto-duck) ----
  useEffect(() => {
    engineRef.current?.setDuck(talkActive || micActive);
  }, [talkActive, micActive]);

  useEffect(() => {
    if (!settings.autoDuck) {
      const m = micRef.current;
      if (m.raf) cancelAnimationFrame(m.raf);
      if (m.stream) m.stream.getTracks().forEach((t) => t.stop());
      if (m.ctx) m.ctx.close();
      micRef.current = { active: false };
      setMicActive(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        const data = new Uint8Array(an.frequencyBinCount);
        let quietSince = performance.now();
        micRef.current = { stream, ctx, active: false };
        const loop = () => {
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          let next = micRef.current.active;
          if (rms > 0.06) {
            quietSince = performance.now();
            next = true;
          } else if (performance.now() - quietSince > 500) {
            next = false;
          }
          if (next !== micRef.current.active) {
            micRef.current.active = next;
            setMicActive(next);
          }
          micRef.current.raf = requestAnimationFrame(loop);
        };
        micRef.current.raf = requestAnimationFrame(loop);
      } catch {
        setBanner("Microphone access denied — auto-duck turned off.");
        setSettings((s) => ({ ...s, autoDuck: false }));
      }
    })();
    return () => {
      cancelled = true;
      const m = micRef.current;
      if (m.raf) cancelAnimationFrame(m.raf);
      if (m.stream) m.stream.getTracks().forEach((t) => t.stop());
      if (m.ctx) m.ctx.close();
      micRef.current = { active: false };
    };
  }, [settings.autoDuck]);

  // ---- Enumerate audio output devices ----
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const load = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        setDevices(devs.filter((d) => d.kind === "audiooutput"));
      } catch {
        /* ignore */
      }
    };
    load();
    navigator.mediaDevices.addEventListener?.("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", load);
  }, []);

  const currentPlaylist = useMemo(
    () => playlists.find((p) => p.id === currentPlaylistId) || null,
    [playlists, currentPlaylistId]
  );

  const queueTracks = useMemo(
    () => (currentPlaylist ? currentPlaylist.trackIds.map((id) => tracks[id]).filter(Boolean) : []),
    [currentPlaylist, tracks]
  );

  const getUrl = useCallback((t) => platform.getUrl(t), []);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.syncQueue(queueTracks, getUrl, currentTrackId);
  }, [queueTracks, getUrl, currentTrackId]);

  // ---- Persist ----
  useEffect(() => {
    if (!loaded) return;
    platform.saveState({ tracks, playlists, currentPlaylistId, settings });
  }, [tracks, playlists, currentPlaylistId, settings, loaded]);

  // ---- Live hotkeys ----
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea" || e.target?.isContentEditable)
        return;
      const eng = engineRef.current;
      if (!eng) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          eng.togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          eng.next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          eng.prev();
          break;
        case "ArrowUp":
          e.preventDefault();
          setSettings((s) => ({ ...s, volume: Math.min(1, s.volume + 0.05) }));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSettings((s) => ({ ...s, volume: Math.max(0, s.volume - 0.05) }));
          break;
        case "KeyT":
          e.preventDefault();
          setTalkActive((v) => !v);
          break;
        case "KeyC":
          e.preventDefault();
          eng.cueStop();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Scheduler (auto start/stop per show time) ----
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const cur = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const day = now.toDateString();
      playlists.forEach((pl) => {
        const s = pl.schedule;
        if (!s || !s.enabled) return;
        if (s.start === cur && schedRef.current.start[pl.id] !== `${day} ${cur}`) {
          schedRef.current.start[pl.id] = `${day} ${cur}`;
          setCurrentPlaylistId(pl.id);
          setAutoStartPending(pl.id);
          setBanner(`⏱ Auto-started "${pl.name}"`);
        }
        if (s.autoStop !== false && s.end === cur && schedRef.current.end[pl.id] !== `${day} ${cur}`) {
          schedRef.current.end[pl.id] = `${day} ${cur}`;
          const e = engineRef.current;
          if (e && !e.active.paused) e.togglePlay();
          setBanner(`⏱ Show "${pl.name}" ended — playout stopped`);
        }
      });
    };
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [playlists]);

  useEffect(() => {
    if (autoStartPending && currentPlaylistId === autoStartPending && queueTracks.length) {
      engineRef.current?.playIndex(0);
      setAutoStartPending(null);
    }
  }, [autoStartPending, currentPlaylistId, queueTracks]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  // ---------------- Playlist actions ----------------
  const createPlaylist = (name) => {
    const pl = { id: uid(), name, trackIds: [] };
    setPlaylists((prev) => [...prev, pl]);
    setCurrentPlaylistId(pl.id);
  };
  const renamePlaylist = (id, name) =>
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  const setSchedule = (id, schedule) =>
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, schedule } : p)));

  const deletePlaylist = (id) => {
    const pl = playlists.find((p) => p.id === id);
    const remaining = playlists.filter((p) => p.id !== id);
    setPlaylists(remaining);
    if (currentPlaylistId === id) setCurrentPlaylistId(remaining[0]?.id || null);
    if (pl) cleanupTracks(pl.trackIds, remaining);
  };

  const cleanupTracks = (candidateIds, remainingPlaylists) => {
    const stillUsed = new Set();
    remainingPlaylists.forEach((p) => p.trackIds.forEach((tid) => stillUsed.add(tid)));
    const toDelete = candidateIds.filter((tid) => !stillUsed.has(tid));
    if (toDelete.length === 0) return;
    setTracks((prev) => {
      const next = { ...prev };
      toDelete.forEach((tid) => {
        if (next[tid]) {
          platform.deleteFile(next[tid]);
          delete next[tid];
        }
      });
      return next;
    });
  };

  const appendTracksToCurrent = (newTracks, newIds) => {
    setTracks((prev) => ({ ...prev, ...newTracks }));
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === currentPlaylistId ? { ...p, trackIds: [...p.trackIds, ...newIds] } : p
      )
    );
  };

  // ---------------- Import ----------------
  const addBrowserFiles = async (files) => {
    if (!currentPlaylist) return;
    const newTracks = {};
    const newIds = [];
    for (const file of files) {
      if (!/\.(mp3|wav|m4a)$/i.test(file.name)) continue;
      const id = uid();
      await putBlob(id, file);
      const url = URL.createObjectURL(file);
      const duration = await readDuration(url);
      URL.revokeObjectURL(url);
      newTracks[id] = { id, name: file.name, size: file.size, type: file.type, duration };
      newIds.push(id);
    }
    if (newIds.length) appendTracksToCurrent(newTracks, newIds);
  };

  const mergeDescriptors = async (picked) => {
    const newTracks = {};
    const newIds = [];
    for (const f of picked) {
      const id = f.id || uid();
      const url = await platform.getUrl({ ...f, id });
      const duration = url ? await readDuration(url) : 0;
      newTracks[id] = { id, name: f.name, size: f.size, path: f.path, duration };
      newIds.push(id);
    }
    if (newIds.length) appendTracksToCurrent(newTracks, newIds);
  };

  const addDialogFiles = async () => {
    if (!currentPlaylist) return;
    const picked = await platform.importViaDialog();
    if (picked?.length) await mergeDescriptors(picked);
  };

  const handleDropFiles = async (fileList) => {
    if (!currentPlaylist) return;
    const files = Array.from(fileList).filter((f) => /\.(mp3|wav|m4a)$/i.test(f.name));
    if (!files.length) return;
    if (platform.isElectron && files[0].path) {
      const picked = await platform.importPaths(files.map((f) => f.path));
      if (picked?.length) await mergeDescriptors(picked);
    } else {
      await addBrowserFiles(files);
    }
  };

  // ---------------- Reorder / remove / replace ----------------
  const reorder = (from, to) => {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== currentPlaylistId) return p;
        const ids = [...p.trackIds];
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        return { ...p, trackIds: ids };
      })
    );
  };

  const removeTrack = (index) => {
    if (!currentPlaylist) return;
    const removedId = currentPlaylist.trackIds[index];
    const nextPlaylists = playlists.map((p) =>
      p.id === currentPlaylistId ? { ...p, trackIds: p.trackIds.filter((_, i) => i !== index) } : p
    );
    setPlaylists(nextPlaylists);
    cleanupTracks([removedId], nextPlaylists);
  };

  const replaceBrowserFile = async (index, file) => {
    if (!currentPlaylist) return;
    const oldId = currentPlaylist.trackIds[index];
    const id = uid();
    await putBlob(id, file);
    const url = URL.createObjectURL(file);
    const duration = await readDuration(url);
    URL.revokeObjectURL(url);
    const newTrack = { id, name: file.name, size: file.size, type: file.type, duration };
    setTracks((prev) => ({ ...prev, [id]: newTrack }));
    const nextPlaylists = playlists.map((p) =>
      p.id === currentPlaylistId
        ? { ...p, trackIds: p.trackIds.map((tid, i) => (i === index ? id : tid)) }
        : p
    );
    setPlaylists(nextPlaylists);
    cleanupTracks([oldId], nextPlaylists);
  };

  const replaceDialogFile = async (index) => {
    if (!currentPlaylist) return;
    const picked = await platform.importViaDialog();
    if (!picked?.length) return;
    const f = picked[0];
    const oldId = currentPlaylist.trackIds[index];
    const id = f.id || uid();
    const url = await platform.getUrl({ ...f, id });
    const duration = url ? await readDuration(url) : 0;
    const newTrack = { id, name: f.name, size: f.size, path: f.path, duration };
    setTracks((prev) => ({ ...prev, [id]: newTrack }));
    const nextPlaylists = playlists.map((p) =>
      p.id === currentPlaylistId
        ? { ...p, trackIds: p.trackIds.map((tid, i) => (i === index ? id : tid)) }
        : p
    );
    setPlaylists(nextPlaylists);
    cleanupTracks([oldId], nextPlaylists);
  };

  // ---------------- Track editor save ----------------
  const saveEditedTrack = async (blob, name, format, duration) => {
    let meta;
    if (platform.isElectron) {
      const d = await platform.saveMedia(name, blob);
      meta = { id: d.id, name, path: d.path, size: d.size, duration };
    } else {
      const id = uid();
      await putBlob(id, blob);
      meta = { id, name, type: format === "mp3" ? "audio/mpeg" : "audio/wav", duration };
    }
    appendTracksToCurrent({ [meta.id]: meta }, [meta.id]);
    setBanner(`Saved "${name}" to ${currentPlaylist?.name}`);
  };

  // ---------------- Silence analysis ----------------
  const analyzeSilenceForCurrent = async () => {
    const targets = queueTracks.filter((t) => t.tailStart == null);
    if (!targets.length) return;
    setBanner("Analyzing silence for tight playout…");
    for (const t of targets) {
      try {
        const url = await platform.getUrl(t);
        const buf = await decodeToBuffer(url);
        const { leadIn, tailStart } = detectSilence(buf);
        setTracks((prev) => (prev[t.id] ? { ...prev, [t.id]: { ...prev[t.id], leadIn, tailStart } } : prev));
      } catch {
        /* ignore */
      }
    }
    setBanner("");
  };

  // ---------------- Share ----------------
  const exportPlaylist = async () => {
    if (!currentPlaylist || !currentPlaylist.trackIds.length) return;
    setBanner("Packaging playlist for sharing…");
    const out = { app: "hotlive95", version: 1, name: currentPlaylist.name, schedule: currentPlaylist.schedule, tracks: [] };
    for (const id of currentPlaylist.trackIds) {
      const t = tracks[id];
      if (!t) continue;
      const url = await platform.getUrl(t);
      const blob = await (await fetch(url)).blob();
      out.tracks.push({
        name: t.name,
        type: t.type || blob.type,
        duration: t.duration,
        leadIn: t.leadIn,
        tailStart: t.tailStart,
        data: await blobToB64(blob),
      });
    }
    const jsonBlob = new Blob([JSON.stringify(out)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(jsonBlob);
    a.download = `${currentPlaylist.name}.hlp.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setBanner("");
  };

  const importPlaylist = async (file) => {
    setBanner("Importing shared playlist…");
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setBanner("That file is not a valid Hot Live 95 playlist.");
      return;
    }
    if (!data?.tracks) {
      setBanner("That file is not a valid Hot Live 95 playlist.");
      return;
    }
    const newTracks = {};
    const ids = [];
    for (const t of data.tracks) {
      const blob = b64ToBlob(t.data, t.type || "audio/mpeg");
      let meta;
      if (platform.isElectron) {
        const d = await platform.saveMedia(t.name, blob);
        meta = { id: d.id, name: t.name, path: d.path, size: d.size, duration: t.duration, leadIn: t.leadIn, tailStart: t.tailStart };
      } else {
        const id = uid();
        await putBlob(id, blob);
        meta = { id, name: t.name, type: t.type, duration: t.duration, leadIn: t.leadIn, tailStart: t.tailStart };
      }
      newTracks[meta.id] = meta;
      ids.push(meta.id);
    }
    const pl = { id: uid(), name: data.name || "Imported Playlist", trackIds: ids, schedule: data.schedule };
    setTracks((prev) => ({ ...prev, ...newTracks }));
    setPlaylists((prev) => [...prev, pl]);
    setCurrentPlaylistId(pl.id);
    setBanner(`Imported "${pl.name}" (${ids.length} tracks)`);
  };

  // ---------------- Transport + cue + toggles ----------------
  const playTrack = (index) => engineRef.current?.playIndex(index);
  const togglePlay = () => engineRef.current?.togglePlay();
  const next = () => engineRef.current?.next();
  const prev = () => engineRef.current?.prev();
  const seek = (t) => engineRef.current?.seek(t);

  const cueTrack = (index) => {
    const t = queueTracks[index];
    if (t) engineRef.current?.cuePlay(t);
  };
  const cueToggle = () => engineRef.current?.cueToggle();
  const cueStop = () => engineRef.current?.cueStop();
  const cueSeek = (t) => engineRef.current?.cueSeek(t);

  const setVolume = (v) => setSettings((s) => ({ ...s, volume: v }));
  const toggleAutoplay = () => setSettings((s) => ({ ...s, autoplay: !s.autoplay }));
  const toggleCrossfade = () => setSettings((s) => ({ ...s, crossfade: !s.crossfade }));
  const setCrossfadeSeconds = (n) => setSettings((s) => ({ ...s, crossfadeSeconds: n }));
  const setProgramSink = (id) => setSettings((s) => ({ ...s, programSink: id }));
  const setCueSink = (id) => setSettings((s) => ({ ...s, cueSink: id }));
  const toggleAutoDuck = () => setSettings((s) => ({ ...s, autoDuck: !s.autoDuck }));
  const toggleTrimSilence = () =>
    setSettings((s) => {
      const on = !s.trimSilence;
      if (on) analyzeSilenceForCurrent();
      return { ...s, trimSilence: on };
    });

  const currentTrack = currentTrackId ? tracks[currentTrackId] : null;
  const cueTrackObj = cue.trackId ? tracks[cue.trackId] : null;
  const onAir = playback.isPlaying;

  const durationOf = useCallback(
    (pl) => pl.trackIds.reduce((sum, id) => sum + (tracks[id]?.duration || 0), 0),
    [tracks]
  );

  return (
    <div className="h-screen w-screen flex flex-col hl-app-bg" data-testid="app-root">
      <Header onAir={onAir} nowPlaying={currentTrack ? currentTrack.name : null} />

      {banner && (
        <div
          className="px-4 py-2 text-center text-sm bg-[rgba(255,90,31,0.15)] border-b border-[var(--hl-fire)] text-[var(--hl-fire)]"
          data-testid="app-banner"
        >
          {banner}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <Sidebar
          playlists={playlists}
          currentPlaylistId={currentPlaylistId}
          onSelect={setCurrentPlaylistId}
          onCreate={createPlaylist}
          onRename={renamePlaylist}
          onDelete={deletePlaylist}
          onSchedule={setScheduleForId}
          onImportPlaylist={importPlaylist}
          durationOf={durationOf}
        />
        <main className="flex-1 flex flex-col min-w-0">
          <TrackList
            playlist={currentPlaylist}
            tracks={tracks}
            currentTrackId={currentTrackId}
            cueTrackId={cue.trackId}
            isPlaying={playback.isPlaying}
            isElectron={platform.isElectron}
            onAddFiles={addBrowserFiles}
            onImportDialog={addDialogFiles}
            onDropFiles={handleDropFiles}
            onReorder={reorder}
            onRemove={removeTrack}
            onReplaceFiles={replaceBrowserFile}
            onReplaceDialog={replaceDialogFile}
            onPlayTrack={playTrack}
            onTogglePlay={togglePlay}
            onCueTrack={cueTrack}
            onEditTrack={(i) => setEditorTrack(queueTracks[i])}
            onExportPlaylist={exportPlaylist}
          />
        </main>
      </div>

      <CuePanel
        cueTrack={cueTrackObj}
        cue={cue}
        onToggle={cueToggle}
        onStop={cueStop}
        onSeek={cueSeek}
        devices={devices}
        programSink={settings.programSink}
        cueSink={settings.cueSink}
        onProgramSink={setProgramSink}
        onCueSink={setCueSink}
      />

      <PlayerBar
        track={currentTrack}
        isPlaying={playback.isPlaying}
        currentTime={playback.currentTime}
        duration={playback.duration}
        volume={settings.volume}
        autoplay={settings.autoplay}
        crossfade={settings.crossfade}
        crossfadeSeconds={settings.crossfadeSeconds}
        trimSilence={settings.trimSilence}
        talkActive={talkActive}
        autoDuck={settings.autoDuck}
        micActive={micActive}
        onTogglePlay={togglePlay}
        onNext={next}
        onPrev={prev}
        onSeek={seek}
        onVolume={setVolume}
        onToggleAutoplay={toggleAutoplay}
        onToggleCrossfade={toggleCrossfade}
        onCrossfadeSeconds={setCrossfadeSeconds}
        onToggleTrimSilence={toggleTrimSilence}
        onToggleTalk={() => setTalkActive((v) => !v)}
        onToggleAutoDuck={toggleAutoDuck}
      />

      {editorTrack && (
        <TrackEditor
          track={editorTrack}
          getUrl={getUrl}
          onClose={() => setEditorTrack(null)}
          onSave={saveEditedTrack}
        />
      )}

      {scheduleForId && (
        <ScheduleModal
          playlist={playlists.find((p) => p.id === scheduleForId)}
          onClose={() => setScheduleForId(null)}
          onSave={setSchedule}
        />
      )}
    </div>
  );
}

export default App;
