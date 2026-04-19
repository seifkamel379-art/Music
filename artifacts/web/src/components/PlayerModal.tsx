import React, { useEffect, useRef, useState } from "react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useTheme } from "@/contexts/ThemeContext";

interface Props {
  onClose: () => void;
  isFav: boolean;
  onFavorite: () => void;
  onDownload: () => void;
  isDownloading: boolean;
}

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function parseDuration(label?: string | null) {
  if (!label) return 0;
  const parts = label.split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

export default function PlayerModal({ onClose, isFav, onFavorite, onDownload, isDownloading }: Props) {
  const { currentTrack, status, pauseOrResume, playNext, playPrev, seekTo, queue } = useAudioPlayer();
  const { colors, themeMode } = useTheme();
  const [imgErr, setImgErr] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  const bg = themeMode === "dark" ? "#121212" : colors.background;
  const duration = status.duration > 0 ? status.duration : parseDuration(currentTrack?.duration);
  const liveProgress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const displayProgress = dragProgress !== null ? dragProgress : liveProgress;
  const currentIndex = queue.findIndex(t => t.videoId === currentTrack?.videoId);
  const hasNext = currentIndex < queue.length - 1;
  const hasPrev = currentIndex > 0;
  const artSize = Math.min(window.innerWidth - 48, 340);

  function getRatio(clientX: number) {
    const bar = barRef.current; if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  useEffect(() => {
    const onUp = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return; dragging.current = false;
      const x = "touches" in e ? e.changedTouches[0].clientX : e.clientX;
      seekTo(getRatio(x) * duration); setDragProgress(null);
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const x = "touches" in e ? e.touches[0].clientX : e.clientX;
      setDragProgress(getRatio(x));
    };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: true }); window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp);
    };
  }, [duration, seekTo]);

  useEffect(() => { setImgErr(false); }, [currentTrack?.videoId]);

  if (!currentTrack) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 50, background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <button onClick={onClose} style={closeBtnSt}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.foreground} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#535353" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <p style={{ color: colors.mutedForeground, fontSize: 18, marginTop: 16 }}>اختار أغنية تبدأ تشغيلها</p>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: bg, display: "flex", flexDirection: "column", overflowY: "auto" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", paddingInline: 8, paddingTop: 52, paddingBottom: 16, flexShrink: 0 }}>
        <button onClick={onClose} style={closeBtnSt}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.foreground} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>تشغيل الآن</div>
          {queue.length > 1 && (
            <div style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>{currentIndex + 1} / {queue.length}</div>
          )}
        </div>
        <div style={{ width: 44 }} />
      </div>

      {/* Album Art */}
      <div style={{ display: "flex", justifyContent: "center", paddingInline: 24, flexShrink: 0 }}>
        <div style={{
          width: artSize, height: artSize, borderRadius: 10, overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          position: "relative", background: "#282828",
          transform: status.playing ? "scale(1.04)" : "scale(1)",
          transition: "transform 0.5s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          {currentTrack.thumbnail && !imgErr
            ? <img src={currentTrack.thumbnail} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#535353" strokeWidth="1"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              </div>
          }
          {status.isBuffering && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid #333", borderTopColor: "#1DB954", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}
        </div>
      </div>

      {/* Track Info + Actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 24px 0", direction: "rtl" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: colors.foreground, fontSize: 22, fontWeight: 700, letterSpacing: -0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {currentTrack.title}
          </div>
          <div style={{ color: colors.mutedForeground, fontSize: 15, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {currentTrack.artist}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0, marginRight: 8 }}>
          {/* Favorite */}
          <button onClick={onFavorite} style={{ width: 44, height: 44, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isFav
              ? <svg width="24" height="24" viewBox="0 0 24 24" fill="#1DB954"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            }
          </button>
          {/* Download */}
          <button onClick={onDownload} disabled={isDownloading} style={{ width: 44, height: 44, background: "none", border: "none", cursor: isDownloading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isDownloading
              ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1DB954" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" strokeDasharray="40 20"/></svg>
              : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            }
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "20px 24px 0" }}>
        <div
          ref={barRef}
          style={{ height: 44, display: "flex", alignItems: "center", cursor: "pointer", position: "relative", direction: "ltr" }}
          onMouseDown={e => { dragging.current = true; setDragProgress(getRatio(e.clientX)); }}
          onTouchStart={e => { dragging.current = true; setDragProgress(getRatio(e.touches[0].clientX)); }}
          onClick={e => { seekTo(getRatio(e.clientX) * duration); }}
        >
          <div style={{ width: "100%", height: 4, borderRadius: 2, background: colors.border, position: "relative" }}>
            <div style={{ height: 4, borderRadius: 2, background: "#1DB954", width: `${displayProgress * 100}%`, transition: dragging.current ? "none" : "width 0.5s linear" }} />
          </div>
          <div style={{
            position: "absolute", top: "50%", left: `calc(${displayProgress * 100}% - 8px)`,
            width: 16, height: 16, borderRadius: "50%", background: colors.foreground,
            pointerEvents: "none", transform: "translateY(-50%)",
            transition: dragging.current ? "none" : "left 0.1s linear",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)"
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 0 }}>
          <span style={{ color: colors.mutedForeground, fontSize: 12 }}>{fmt(status.currentTime)}</span>
          <span style={{ color: colors.mutedForeground, fontSize: 12 }}>{duration > 0 ? fmt(duration) : currentTrack.duration || "0:00"}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 24px 0" }}>
        <button style={ctrlBtnSt(colors.mutedForeground)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
        </button>

        <button onClick={playPrev} disabled={!hasPrev} style={{ width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: hasPrev ? "pointer" : "default", opacity: hasPrev ? 1 : 0.35, transition: "opacity 0.2s" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill={colors.foreground}><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke={colors.foreground} strokeWidth="2"/></svg>
        </button>

        <button onClick={pauseOrResume} style={{ width: 66, height: 66, borderRadius: "50%", background: colors.foreground, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "transform 0.1s", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
          {status.playing
            ? <svg width="28" height="28" viewBox="0 0 24 24" fill={colors.background}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            : <svg width="28" height="28" viewBox="0 0 24 24" fill={colors.background} style={{ marginLeft: 3 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
        </button>

        <button onClick={playNext} disabled={!hasNext} style={{ width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: hasNext ? "pointer" : "default", opacity: hasNext ? 1 : 0.35, transition: "opacity 0.2s" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill={colors.foreground}><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke={colors.foreground} strokeWidth="2"/></svg>
        </button>

        <button style={ctrlBtnSt(colors.mutedForeground)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </button>
      </div>

      <div style={{ height: 48 }} />
    </div>
  );
}

const closeBtnSt: React.CSSProperties = {
  width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
  background: "none", border: "none", cursor: "pointer", flexShrink: 0,
};

function ctrlBtnSt(color: string): React.CSSProperties {
  return {
    width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", cursor: "pointer", color, opacity: 0.65,
  };
}
