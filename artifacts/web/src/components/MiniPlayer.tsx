import { useState } from "react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";

interface Props { onOpenPlayer: () => void; }

const C = { espresso: "#000000", gold: "#1DB954", primary: "#1DB954", muted: "#181818" };

export default function MiniPlayer({ onOpenPlayer }: Props) {
  const { currentTrack, status, pauseOrResume, clearPlayer } = useAudioPlayer();
  const [imgErr, setImgErr] = useState(false);

  if (!currentTrack) return null;

  const progress = status.duration > 0 ? (status.currentTime / status.duration) * 100 : 0;

  return (
    <div
      style={{
        position: "fixed", left: 12, right: 12, bottom: 82, zIndex: 30,
        borderRadius: 10, paddingTop: 10, paddingInline: 12, paddingBottom: 10,
        display: "flex", alignItems: "center", gap: 12,
        background: "#1a1a1a",
        boxShadow: "0 -4px 30px rgba(0,0,0,0.5)",
        cursor: "pointer",
      }}
      onClick={onOpenPlayer}
    >
      {/* Thumbnail */}
      {currentTrack.thumbnail && !imgErr ? (
        <img
          src={currentTrack.thumbnail}
          onError={() => setImgErr(true)}
          style={{ width: 50, height: 50, borderRadius: 15, objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div style={{ width: 50, height: 50, borderRadius: 15, background: C.muted, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, direction: "rtl" }}>
        <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentTrack.title}
        </div>
        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 500, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {status.isBuffering ? "جارٍ التحميل..." : currentTrack.artist}
        </div>
      </div>

      {/* Play/Pause button */}
      <button
        onClick={e => { e.stopPropagation(); pauseOrResume(); }}
        style={{
          width: 44, height: 44, borderRadius: 22,
          background: C.gold, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        {status.playing ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill={C.espresso}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill={C.espresso} style={{ marginLeft: 2 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
        )}
      </button>

      {/* Progress bar at bottom */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: 3,
        borderBottomLeftRadius: 26, borderBottomRightRadius: 26,
        overflow: "hidden", background: "rgba(255,244,223,0.15)",
      }}>
        <div style={{ height: 3, width: `${progress}%`, background: C.gold, transition: "width 0.5s linear" }} />
      </div>
    </div>
  );
}
