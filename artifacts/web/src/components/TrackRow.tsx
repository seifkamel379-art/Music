import { useState } from "react";
import type { Track } from "@/lib/storage";
import type { Colors } from "@/contexts/ThemeContext";

const COVERS = ["/cover-one.png", "/cover-two.png", "/cover-three.png"];

interface Props {
  track: Track; index: number;
  isCurrent: boolean; isPlaying: boolean; isFavorite: boolean;
  onPlay: () => void; onFavorite: () => void; onPlaylist: () => void;
  onDownload: () => void; onRemove?: () => void;
  C: Colors;
}

export default function TrackRow({ track, index, isCurrent, isPlaying, isFavorite, onPlay, onFavorite, onPlaylist, onDownload, onRemove, C }: Props) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div onClick={onPlay} style={{
      display: "flex", alignItems: "center", gap: 10,
      margin: "0 18px 8px", border: `1px solid ${isCurrent ? C.primary : C.border}`,
      borderRadius: 20, padding: 10, background: isCurrent ? C.secondary : C.card,
      cursor: "pointer", userSelect: "none", transition: "background 0.15s",
    }}>
      {/* Thumbnail */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        {track.thumbnail && !imgErr ? (
          <img src={track.thumbnail} onError={() => setImgErr(true)} style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover", display: "block" }} />
        ) : (
          <img src={COVERS[index % 3]} style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover", display: "block" }} />
        )}
        {isPlaying && (
          <div style={{ position: "absolute", bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, background: "rgba(255,244,223,0.9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: C.primary }} />
          </div>
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, direction: "rtl" }}>
        <div style={{ color: C.foreground, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.title}</div>
        <div style={{ color: C.mutedForeground, fontSize: 12, fontWeight: 500, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.artist} · {track.duration}</div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <Btn onClick={onFavorite} title="مفضلة">
          {isFavorite
            ? <svg width="19" height="19" viewBox="0 0 24 24" fill="#e05252"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          }
        </Btn>
        <Btn onClick={onPlaylist} title="أضف للمكتبة">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </Btn>
        <Btn onClick={onDownload} title="تحميل">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </Btn>
        {onRemove && (
          <Btn onClick={onRemove} title="حذف">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.destructive} strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </Btn>
        )}
      </div>
    </div>
  );
}

function Btn({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
      {children}
    </button>
  );
}
