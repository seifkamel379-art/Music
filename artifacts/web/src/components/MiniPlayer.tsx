import { useState } from "react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useTheme } from "@/contexts/ThemeContext";

interface Props { onOpenPlayer: () => void; }

export default function MiniPlayer({ onOpenPlayer }: Props) {
  const { currentTrack, status, pauseOrResume, playNext, queue } = useAudioPlayer();
  const { colors, themeMode } = useTheme();
  const [imgErr, setImgErr] = useState(false);

  if (!currentTrack) return null;

  const progress = status.duration > 0 ? (status.currentTime / status.duration) * 100 : 0;
  const currentIdx = queue.findIndex(t => t.videoId === currentTrack.videoId);
  const hasNext = currentIdx < queue.length - 1;
  const cardBg = themeMode === "dark" ? "#111" : colors.card;

  return (
    <div style={{
      position: "fixed", left: 8, right: 8, bottom: 80, zIndex: 30,
      animation: "slide-up 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
    }}>
      <div
        onClick={onOpenPlayer}
        style={{
          borderRadius: 14,
          background: cardBg,
          boxShadow: status.playing
            ? "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1.5px #1DB954, 0 0 24px rgba(29,185,84,0.35)"
            : "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1.5px rgba(29,185,84,0.45)",
          cursor: "pointer",
          overflow: "hidden",
          transition: "box-shadow 0.4s ease",
        }}
      >
        {/* Green progress bar — thicker, more visible */}
        <div style={{ height: 3, background: themeMode === "dark" ? "#1a1a1a" : colors.border }}>
          <div style={{
            height: 3, width: `${progress}%`, background: "#1DB954",
            transition: "width 0.5s linear",
            boxShadow: "0 0 6px #1DB95488",
          }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px 9px 12px", direction: "rtl" }}>
          {/* Thumbnail */}
          <div style={{
            width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0,
            background: colors.muted, position: "relative",
            border: status.playing ? "1.5px solid #1DB954" : "1.5px solid transparent",
            transition: "border-color 0.3s ease",
          }}>
            {currentTrack.thumbnail && !imgErr
              ? <img src={currentTrack.thumbnail} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1DB954" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
            }
            {status.isBuffering && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2.5px solid #333", borderTopColor: "#1DB954", animation: "spin 0.8s linear infinite" }} />
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: colors.foreground, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentTrack.title}
            </div>
            <div style={{ color: "#1DB954", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
              {status.playing ? "● يُشغَّل الآن" : currentTrack.artist}
            </div>
          </div>

          {/* Play/Pause */}
          <button
            onClick={e => { e.stopPropagation(); pauseOrResume(); }}
            style={{
              width: 42, height: 42,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "#1DB954", border: "none", cursor: "pointer",
              flexShrink: 0, borderRadius: "50%",
              boxShadow: status.playing ? "0 0 14px rgba(29,185,84,0.5)" : "none",
              transition: "box-shadow 0.3s ease",
            }}
          >
            {status.playing
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="#000" style={{ marginLeft: 2 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
            }
          </button>

          {/* Next */}
          <button
            onClick={e => { e.stopPropagation(); if (hasNext) playNext(); }}
            disabled={!hasNext}
            style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: hasNext ? "pointer" : "default", opacity: hasNext ? 0.85 : 0.25, flexShrink: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={colors.foreground}><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke={colors.foreground} strokeWidth="2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
