import React from "react";
import { X, CloudUpload, FolderCheck, FolderPlus, Loader2, Unplug, HardDriveDownload, RotateCcw } from "lucide-react";

const fmtWhen = (iso) => {
  if (!iso) return "never";
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "recently";
  }
};

export default function BackupModal({
  supported,
  isDesktop,
  folderName,
  lastBackupAt,
  busy,
  onBackupNow,
  onChooseFolder,
  onDisconnect,
  onRestore,
  onClose,
}) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm grid place-items-center p-4"
      data-testid="backup-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md hl-panel rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <CloudUpload size={18} className="text-[var(--hl-fire)]" />
            <h2 className="font-display text-lg">Back up playlists</h2>
          </div>
          <button data-testid="backup-close" onClick={onClose} className="h-8 w-8 grid place-items-center rounded hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--hl-muted)]">
            Save every playlist as its own file so they survive a reinstall or a move to another device.
          </p>

          {/* One-tap backup — works everywhere (iPad picks iCloud Drive) */}
          <button
            data-testid="backup-now-button"
            onClick={onBackupNow}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg hl-fire-gradient text-white font-700 hover:brightness-110 transition disabled:opacity-60"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <HardDriveDownload size={18} />}
            {folderName ? "Back up now to folder" : "Back Up All Playlists"}
          </button>
          {!folderName && (
            <p className="text-[11px] text-[var(--hl-muted)] -mt-2">
              On iPad, choose <span className="text-[var(--hl-text)]">iCloud Drive</span> (or Files) when the save sheet opens.
            </p>
          )}

          {/* Restore latest backup from the connected folder */}
          {folderName && (
            <button
              data-testid="backup-restore-button"
              onClick={onRestore}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[var(--hl-cue)] text-[var(--hl-cue)] hover:bg-[var(--hl-cue)]/10 text-sm font-600 transition disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Restore latest backup
            </button>
          )}

          {/* Auto-backup folder (desktop / Chromium) */}
          <div className="rounded-xl border border-[var(--hl-line)] bg-black/30 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">Automatic backup</div>
            {isDesktop ? (
              <>
                <div className="flex items-center gap-2 text-sm" data-testid="backup-folder-name">
                  <FolderCheck size={16} className="text-[#2ee5c4]" />
                  <span className="truncate">{folderName}</span>
                </div>
                <p className="text-[11px] text-[var(--hl-muted)]">
                  Your playlists auto-save to the flash drive as you work — no taps needed. After a
                  reinstall, tap <span className="text-[var(--hl-text)]">Restore latest backup</span> to reload them all.
                </p>
              </>
            ) : supported ? (
              folderName ? (
                <>
                  <div className="flex items-center gap-2 text-sm" data-testid="backup-folder-name">
                    <FolderCheck size={16} className="text-[#2ee5c4]" />
                    <span className="truncate">{folderName}</span>
                  </div>
                  <p className="text-[11px] text-[var(--hl-muted)]">
                    Your playlists auto-save to this folder whenever you change them. Point it at an iCloud
                    Drive / OneDrive / flash-drive folder to keep an off-device copy.
                  </p>
                  <button
                    data-testid="backup-disconnect"
                    onClick={onDisconnect}
                    className="inline-flex items-center gap-1.5 text-[11px] text-[var(--hl-muted)] hover:text-[var(--hl-onair)]"
                  >
                    <Unplug size={13} /> Disconnect folder
                  </button>
                </>
              ) : (
                <>
                  <button
                    data-testid="backup-choose-folder"
                    onClick={onChooseFolder}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[var(--hl-line)] text-[var(--hl-text)] hover:border-[var(--hl-fire)] hover:text-[var(--hl-fire)] text-sm font-600 transition"
                  >
                    <FolderPlus size={16} /> Connect a backup folder
                  </button>
                  <p className="text-[11px] text-[var(--hl-muted)]">
                    Pick a folder once and the studio auto-saves your playlists into it as you work.
                  </p>
                </>
              )
            ) : (
              <p className="text-[11px] text-[var(--hl-amber)]" data-testid="backup-not-supported">
                Silent auto-backup isn't available on this device (iPad/Safari blocks it). Use{" "}
                <span className="text-[var(--hl-text)]">Back Up All Playlists</span> above and save to iCloud Drive —
                the studio will remind you every few hours.
              </p>
            )}
          </div>

          <div className="text-[11px] text-[var(--hl-muted)] text-center" data-testid="backup-last">
            Last backup: <span className="text-[var(--hl-text)]">{fmtWhen(lastBackupAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
