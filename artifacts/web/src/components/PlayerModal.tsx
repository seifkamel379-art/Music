import { useEffect, useRef, useState } from "react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import type { Colors } from "@/contexts/ThemeContext";

interface Props { onClose: () => void; C: Colors; }

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

export default function PlayerModal({ onClose, C }: Props) {
  const { currentTrack, status, pauseOrResume, playNext, playPrev, seekTo, queue } = useAudioPlayer();
  const [imgErr, setImgErr] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  const duration = status.duration > 0 ? status.duration : parseDuration(currentTrack?.duration);
  const liveProgress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const displayProgress = dragProgress !== null ? dragProgress : liveProgress;
  const currentIndex = queue.findIndex(t => t.videoId === currentTrack?.videoId);
  const hasNext = currentIndex < queue.length - 1;
  const hasPrev = currentIndex > 0;
  const artSize = Math.min(window.innerWidth - 64, 340);

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
    window.addEventListener("touchmove", onMove); window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp);
    };
  }, [duration, seekTo]);

  const bg = C.espresso;

  if (!currentTrack) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 50, background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <button onClick={onClose} style={closeBtnSt}><ChevronDown /></button>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 18, direction: "rtl" }}>اختار أغنية تبدأ تشغيلها</p>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: bg, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 48, paddingBottom: 32, overflowY: "auto" }}>

      {/* Top bar */}
      <div style={{ width: "100%", display: "flex", alignItems: "center", paddingInline: 16, paddingBottom: 24 }}>
        <button onClick={onClose} style={closeBtnSt}><ChevronDown /></button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>تشغيل الآن</div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, marginTop: 2, maxWidth: 200, margin: "2px auto 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl" }}>{currentTrack.title}</div>
        </div>
        <div style={{ width: 44 }} />
      </div>

      {/* Art */}
      <div style={{ width: artSize, height: artSize, borderRadius: 28, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.6)", marginBottom: 36, position: "relative" }}>
        {currentTrack.thumbnail && !imgErr
          ? <img src={currentTrack.thumbnail} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ width: "100%", height: "100%", background: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
        }
        {status.isBuffering && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", border: "4px solid rgba(255,255,255,0.2)", borderTopColor: "#1DB954", animation: "spin 0.8s linear infinite" }} />
            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 600, direction: "rtl" }}>جارٍ التحميل...</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ width: "100%", paddingInline: 24, marginBottom: 28, direction: "rtl" }}>
        <div style={{ color: "#fff", fontSize: 26, fontWeight: 700, letterSpacing: -0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentTrack.title}</div>
        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 16, fontWeight: 500, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentTrack.artist}</div>
      </div>

      {/* Progress */}
      <div style={{ width: "100%", paddingInline: 24, marginBottom: 36 }}>
        <div ref={barRef} style={{ height: 44, display: "flex", alignItems: "center", cursor: "pointer", position: "relative", direction: "ltr" }}
          onMouseDown={e => { dragging.current = true; setDragProgress(getRatio(e.clientX)); }}
          onTouchStart={e => { dragging.current = true; setDragProgress(getRatio(e.touches[0].clientX)); }}
          onClick={e => { seekTo(getRatio(e.clientX) * duration); }}
        >
          <div style={{ width: "100%", height: 5, borderRadius: 3, background: "rgba(255,244,223,0.15)", position: "relative" }}>
            <div style={{ height: 5, borderRadius: 3, background: C.gold, width: `${displayProgress * 100}%` }} />
          </div>
          <div style={{ position: "absolute", top: "50%", left: `calc(${displayProgress * 100}% - 10px)`, width: 20, height: 20, borderRadius: "50%", background: C.gold, boxShadow: "0 0 8px #1DB95499", pointerEvents: "none", transform: "translateY(-50%)", transition: dragging.current ? "none" : "left 0.1s linear" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{fmt(status.currentTime)}</span>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{duration > 0 ? fmt(duration) : currentTrack.duration || "0:00"}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 32, marginBottom: 28 }}>
        <button onClick={playPrev} disabled={!hasPrev} style={{ width: 54, height: 54, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: hasPrev ? "pointer" : "default", opacity: hasPrev ? 1 : 0.35 }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke="#fff" strokeWidth="2"/></svg>
        </button>
        <button onClick={pauseOrResume} style={{ width: 72, height: 72, borderRadius: 36, background: C.gold, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 24px #1DB95466" }}>
          {status.playing
            ? <svg width="36" height="36" viewBox="0 0 24 24" fill={C.espresso === "#000000" ? "#000" : C.primaryForeground}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg width="36" height="36" viewBox="0 0 24 24" fill={C.espresso === "#000000" ? "#000" : C.primaryForeground} style={{ marginLeft: 3 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
        </button>
        <button onClick={playNext} disabled={!hasNext} style={{ width: 54, height: 54, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: hasNext ? "pointer" : "default", opacity: hasNext ? 1 : 0.35 }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="#fff" strokeWidth="2"/></svg>
        </button>
      </div>

      {queue.length > 1 && (
        <div style={{ textAlign: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, direction: "rtl" }}>{currentIndex + 1} / {queue.length} من القائمة</span>
        </div>
      )}
    </div>
  );
}

const closeBtnSt: React.CSSProperties = { width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", flexShrink: 0 };

function ChevronDown() {
  return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>;
}
