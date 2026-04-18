import { useState } from "react";
import type { StoredTrack } from "@/lib/storage";

interface Props {
  track: StoredTrack;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  inPlaylist: boolean;
  onPlay: () => void;
  onFavorite: () => void;
  onPlaylist: () => void;
  onDownload: () => void;
  onRemove?: () => void;
}

export default function TrackRow({
  track,
  index,
  isCurrent,
  isPlaying,
  isFavorite,
  inPlaylist,
  onPlay,
  onFavorite,
  onPlaylist,
  onDownload,
  onRemove,
}: Props) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer group transition-all"
      style={{
        background: isCurrent ? "#1DB95415" : "transparent",
        border: `1px solid ${isCurrent ? "#1DB95440" : "transparent"}`,
        animation: `track-in 0.3s ease forwards`,
        animationDelay: `${Math.min(index * 40, 400)}ms`,
        opacity: 0,
      }}
      onClick={onPlay}
    >
      <div
        className="relative flex-shrink-0 rounded-lg overflow-hidden"
        style={{ width: 48, height: 48 }}
      >
        {track.thumbnail && !imgErr ? (
          <img
            src={track.thumbnail}
            alt={track.title}
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-lg"
            style={{ background: "#1a1a1a" }}
          >
            🎵
          </div>
        )}

        {isCurrent && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "#00000099" }}
          >
            {isPlaying ? (
              <div className="flex items-end gap-[3px]">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="wave-bar bg-[#1DB954] rounded-full"
                    style={{
                      width: 3,
                      height: 14,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <span className="text-[#1DB954] text-lg">▶</span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0" dir="rtl">
        <p
          className="text-sm font-semibold truncate"
          style={{ color: isCurrent ? "#1DB954" : "#fff" }}
        >
          {track.title}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: "#888" }}>
          {track.artist} · {track.duration}
        </p>
      </div>

      <div
        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onFavorite}
          className="p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
          title="مفضلة"
        >
          <span style={{ color: isFavorite ? "#e22134" : "#666", fontSize: 15 }}>
            {isFavorite ? "❤️" : "🤍"}
          </span>
        </button>

        <button
          onClick={onPlaylist}
          className="p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
          title="أضف للقائمة"
          style={{ color: inPlaylist ? "#1DB954" : "#666" }}
        >
          <span style={{ fontSize: 15 }}>{inPlaylist ? "✓" : "+"}</span>
        </button>

        <button
          onClick={onDownload}
          className="p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
          title="تحميل"
          style={{ color: "#666" }}
        >
          <span style={{ fontSize: 14 }}>⬇</span>
        </button>

        {onRemove && (
          <button
            onClick={onRemove}
            className="p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
            title="حذف"
            style={{ color: "#e22134" }}
          >
            <span style={{ fontSize: 14 }}>✕</span>
          </button>
        )}
      </div>
    </div>
  );
}
