import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "@/App.css";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import TrackList from "@/components/TrackList";
import PlayerBar from "@/components/PlayerBar";
import AudioEngine from "@/lib/audioEngine";
import { platform } from "@/lib/platform";
import { putBlob } from "@/lib/db";

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const defaultSettings = {
  autoplay: true,
  crossfade: true,
  crossfadeSeconds: 3,
  volume: 1,
};

// Read duration from an audio file object / url.
function readDuration(src) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve(audio.duration || 0);
    audio.onerror = () => resolve(0);
    audio.src = src;
  });
}

function App() {
  const [tracks, setTracks] = useState({});
  const [playlists, setPlaylists] = useState([]);
  const [currentPlaylistId, setCurrentPlaylistId] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [playback, setPlayback] = useState({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });

  const engineRef = useRef(null);

  // ---- Load persisted state on mount ----
  useEffect(() => {
    (async () => {
      const state = await platform.loadState();
      if (state) {
        setTracks(state.tracks || {});
        setPlaylists(state.playlists || []);
        setCurrentPlaylistId(state.currentPlaylistId || state.playlists?.[0]?.id || null);
        setSettings({ ...defaultSettings, ...(state.settings || {}) });
      }
      setLoaded(true);
    })();
  }, []);

  // ---- Init audio engine ----
  useEffect(() => {
    const engine = new AudioEngine((s) => {
      setPlayback({
        isPlaying: s.isPlaying,
        currentTime: s.currentTime,
        duration: s.duration,
      });
      const t = engine.queue[s.index];
      setCurrentTrackId(t ? t.id : null);
    });
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
  }, [settings]);

  const currentPlaylist = useMemo(
    () => playlists.find((p) => p.id === currentPlaylistId) || null,
    [playlists, currentPlaylistId]
  );

  const queueTracks = useMemo(
    () => (currentPlaylist ? currentPlaylist.trackIds.map((id) => tracks[id]).filter(Boolean) : []),
    [currentPlaylist, tracks]
  );

  const getUrl = useCallback((t) => platform.getUrl(t), []);

  // ---- Keep engine queue in sync with the current playlist ----
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.syncQueue(queueTracks, getUrl, currentTrackId);
  }, [queueTracks, getUrl, currentTrackId]);

  // ---- Persist state (metadata) whenever it changes ----
  useEffect(() => {
    if (!loaded) return;
    platform.saveState({ tracks, playlists, currentPlaylistId, settings });
  }, [tracks, playlists, currentPlaylistId, settings, loaded]);

  // ---------------- Playlist actions ----------------
  const createPlaylist = (name) => {
    const pl = { id: uid(), name, trackIds: [] };
    setPlaylists((prev) => [...prev, pl]);
    setCurrentPlaylistId(pl.id);
  };

  const renamePlaylist = (id, name) =>
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));

  const deletePlaylist = (id) => {
    const pl = playlists.find((p) => p.id === id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (currentPlaylistId === id) {
      const remaining = playlists.filter((p) => p.id !== id);
      setCurrentPlaylistId(remaining[0]?.id || null);
    }
    // Clean up tracks no longer referenced by any playlist
    if (pl) cleanupTracks(pl.trackIds, playlists.filter((p) => p.id !== id));
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

  // ---------------- Track import (browser) ----------------
  const addBrowserFiles = async (files) => {
    if (!currentPlaylist) return;
    const newTracks = {};
    const newIds = [];
    for (const file of files) {
      const id = uid();
      await putBlob(id, file);
      const url = URL.createObjectURL(file);
      const duration = await readDuration(url);
      URL.revokeObjectURL(url);
      newTracks[id] = {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        duration,
      };
      newIds.push(id);
    }
    setTracks((prev) => ({ ...prev, ...newTracks }));
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === currentPlaylistId ? { ...p, trackIds: [...p.trackIds, ...newIds] } : p
      )
    );
  };

  // ---------------- Track import (Electron dialog) ----------------
  const addDialogFiles = async () => {
    if (!currentPlaylist) return;
    const picked = await platform.importViaDialog(); // [{id,name,path,size}]
    if (!picked?.length) return;
    const newTracks = {};
    const newIds = [];
    for (const f of picked) {
      const id = f.id || uid();
      const url = await platform.getUrl({ ...f, id });
      const duration = url ? await readDuration(url) : 0;
      newTracks[id] = {
        id,
        name: f.name,
        size: f.size,
        path: f.path,
        duration,
      };
      newIds.push(id);
    }
    setTracks((prev) => ({ ...prev, ...newTracks }));
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === currentPlaylistId ? { ...p, trackIds: [...p.trackIds, ...newIds] } : p
      )
    );
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
      p.id === currentPlaylistId
        ? { ...p, trackIds: p.trackIds.filter((_, i) => i !== index) }
        : p
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

  // ---------------- Transport ----------------
  const playTrack = (index) => engineRef.current?.playIndex(index);
  const togglePlay = () => engineRef.current?.togglePlay();
  const next = () => engineRef.current?.next();
  const prev = () => engineRef.current?.prev();
  const seek = (t) => engineRef.current?.seek(t);

  const setVolume = (v) => setSettings((s) => ({ ...s, volume: v }));
  const toggleAutoplay = () => setSettings((s) => ({ ...s, autoplay: !s.autoplay }));
  const toggleCrossfade = () => setSettings((s) => ({ ...s, crossfade: !s.crossfade }));
  const setCrossfadeSeconds = (n) => setSettings((s) => ({ ...s, crossfadeSeconds: n }));

  const currentTrack = currentTrackId ? tracks[currentTrackId] : null;
  const onAir = playback.isPlaying;

  const durationOf = useCallback(
    (pl) => pl.trackIds.reduce((sum, id) => sum + (tracks[id]?.duration || 0), 0),
    [tracks]
  );

  return (
    <div className="h-screen w-screen flex flex-col hl-app-bg" data-testid="app-root">
      <Header onAir={onAir} nowPlaying={currentTrack ? currentTrack.name : null} />
      <div className="flex-1 flex min-h-0">
        <Sidebar
          playlists={playlists}
          currentPlaylistId={currentPlaylistId}
          onSelect={setCurrentPlaylistId}
          onCreate={createPlaylist}
          onRename={renamePlaylist}
          onDelete={deletePlaylist}
          durationOf={durationOf}
        />
        <main className="flex-1 flex flex-col min-w-0">
          <TrackList
            playlist={currentPlaylist}
            tracks={tracks}
            currentTrackId={currentTrackId}
            isPlaying={playback.isPlaying}
            isElectron={platform.isElectron}
            onAddFiles={addBrowserFiles}
            onImportDialog={addDialogFiles}
            onReorder={reorder}
            onRemove={removeTrack}
            onReplaceFiles={replaceBrowserFile}
            onReplaceDialog={replaceDialogFile}
            onPlayTrack={playTrack}
            onTogglePlay={togglePlay}
          />
        </main>
      </div>
      <PlayerBar
        track={currentTrack}
        isPlaying={playback.isPlaying}
        currentTime={playback.currentTime}
        duration={playback.duration}
        volume={settings.volume}
        autoplay={settings.autoplay}
        crossfade={settings.crossfade}
        crossfadeSeconds={settings.crossfadeSeconds}
        onTogglePlay={togglePlay}
        onNext={next}
        onPrev={prev}
        onSeek={seek}
        onVolume={setVolume}
        onToggleAutoplay={toggleAutoplay}
        onToggleCrossfade={toggleCrossfade}
        onCrossfadeSeconds={setCrossfadeSeconds}
      />
    </div>
  );
}

export default App;
