import { useState } from "react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useTheme } from "@/contexts/ThemeContext";

interface Props { onOpenPlayer: () => void; }

export default function MiniPlayer({ onOpenPlayer }: Props) {
  const { currentTrack, status, pauseOrResume, playNext, queue } = useAudioPlayer();
  const { colors } = useTheme();
  const [imgErr, setImgErr] = useState(false);

  if (!currentTrack) return null;

  const progress = status.duration > 0 ? (status.currentTime / status.duration) * 100 : 0;
  const currentIdx = queue.findIndex(t => t.videoId === currentTrack.videoId);
  const hasNext = currentIdx < queue.length - 1;

  return (
    <div style={{
      position: "fixed", left: 8, right: 8, bottom: 80, zIndex: 30,
      animation: "slide-up 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
    }}>
      <div
        onClick={onOpenPlayer}
        style={{
          borderRadius: 12,
          background: colors.card === "#121212" ? "#1a1a1a" : colors.card,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          cursor: "pointer",
          overflow: "hidden",
          border: `1px solid ${colors.border}`,
        }}
      >
        {/* Progress bar */}
        <div style={{ height: 2, background: colors.border }}>
          <div style={{
            height: 2, width: `${progress}%`, background: "#1DB954",
            transition: "width 0.5s linear",
          }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 12px", direction: "rtl" }}>
          {/* Thumbnail */}
          <div style={{ width: 44, height: 44, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: colors.muted, position: "relative" }}>
            {currentTrack.thumbnail && !imgErr
              ? <img src={currentTrack.thumbnail} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
            }
            {status.isBuffering && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #333", borderTopColor: "#1DB954", animation: "spin 0.8s linear infinite" }} />
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: colors.foreground, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentTrack.title}
            </div>
            <div style={{ color: "#1DB954", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {status.playing ? "يُشغَّل الآن" : currentTrack.artist}
            </div>
          </div>

          {/* Play/Pause */}
          <button
            onClick={e => { e.stopPropagation(); pauseOrResume(); }}
            style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", flexShrink: 0, borderRadius: "50%", transition: "background 0.15s" }}
          >
            {status.playing
              ? <svg width="26" height="26" viewBox="0 0 24 24" fill={colors.foreground}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              : <svg width="26" height="26" viewBox="0 0 24 24" fill={colors.foreground} style={{ marginLeft: 2 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
            }
          </button>

          {/* Next */}
          <button
            onClick={e => { e.stopPropagation(); if (hasNext) playNext(); }}
            disabled={!hasNext}
            style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: hasNext ? "pointer" : "default", opacity: hasNext ? 1 : 0.3, flexShrink: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={colors.foreground}><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke={colors.foreground} strokeWidth="2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
