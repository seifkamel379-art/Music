import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchTracks } from "@workspace/api-client-react";
import { storage, type StoredTrack } from "@/lib/storage";
import TrackRow from "@/components/TrackRow";
import AudioPlayer from "@/components/AudioPlayer";

type Section = "home" | "search" | "playlist" | "favorites";

const QUICK_SEARCHES = ["اغاني مصرية", "عمرو دياب", "ويجز", "تامر حسني", "أم كلثوم", "راب مصري"];

function apiTrackToStored(t: {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail?: string | null;
  streamUrl: string;
}): StoredTrack {
  return {
    videoId: t.videoId,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    thumbnail: t.thumbnail ?? null,
    streamUrl: t.streamUrl,
  };
}

function downloadTrack(track: StoredTrack) {
  const url = `${track.streamUrl}${track.streamUrl.includes("?") ? "&" : "?"}download=1&title=${encodeURIComponent(track.title)}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `${track.title}.mp3`;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

interface Props {
  userName: string;
  onLogout: () => void;
}

export default function MainApp({ userName, onLogout }: Props) {
  const [section, setSection] = useState<Section>("home");
  const [query, setQuery] = useState("اغاني مصرية");
  const [playlist, setPlaylist] = useState<StoredTrack[]>(() => storage.getPlaylist());
  const [favorites, setFavorites] = useState<StoredTrack[]>(() => storage.getFavorites());
  const [history, setHistory] = useState<string[]>(() => storage.getHistory());
  const [currentTrack, setCurrentTrack] = useState<StoredTrack | null>(null);
  const [queue, setQueue] = useState<StoredTrack[]>([]);

  const search = useSearchTracks(
    { q: query },
    {
      query: {
        enabled: query.trim().length > 1,
        staleTime: 60000,
        retry: 1,
      },
    },
  );

  const searchTracks: StoredTrack[] = useMemo(
    () => (search.data?.tracks ?? []).map(apiTrackToStored),
    [search.data],
  );

  const persistPlaylist = useCallback((tracks: StoredTrack[]) => {
    setPlaylist(tracks);
    storage.setPlaylist(tracks);
  }, []);

  const persistFavorites = useCallback((tracks: StoredTrack[]) => {
    setFavorites(tracks);
    storage.setFavorites(tracks);
  }, []);

  const addHistory = useCallback((q: string) => {
    setHistory((prev) => {
      const next = [q, ...prev.filter((x) => x !== q)].slice(0, 8);
      storage.setHistory(next);
      return next;
    });
  }, []);

  const playTrack = useCallback((track: StoredTrack, tracks: StoredTrack[]) => {
    setCurrentTrack(track);
    setQueue(tracks);
  }, []);

  const toggleFavorite = useCallback((track: StoredTrack) => {
    setFavorites((prev) => {
      const exists = prev.some((t) => t.videoId === track.videoId);
      const next = exists ? prev.filter((t) => t.videoId !== track.videoId) : [track, ...prev];
      storage.setFavorites(next);
      return next;
    });
  }, []);

  const addToPlaylist = useCallback((track: StoredTrack) => {
    setPlaylist((prev) => {
      if (prev.some((t) => t.videoId === track.videoId)) return prev;
      const next = [...prev, track];
      storage.setPlaylist(next);
      return next;
    });
  }, []);

  const removeFromPlaylist = useCallback((videoId: string) => {
    setPlaylist((prev) => {
      const next = prev.filter((t) => t.videoId !== videoId);
      storage.setPlaylist(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((videoId: string) => favorites.some((t) => t.videoId === videoId), [favorites]);
  const inPlaylist = useCallback((videoId: string) => playlist.some((t) => t.videoId === videoId), [playlist]);

  const listData: StoredTrack[] = useMemo(() => {
    if (section === "favorites") return favorites;
    if (section === "playlist") return playlist;
    return searchTracks;
  }, [section, favorites, playlist, searchTracks]);

  const featured = useMemo(
    () => (playlist.length > 0 ? playlist.slice(0, 6) : searchTracks.slice(0, 6)),
    [playlist, searchTracks],
  );

  const NAV = [
    { id: "home" as Section, label: "الرئيسية", icon: "🏠" },
    { id: "search" as Section, label: "بحث", icon: "🔍" },
    { id: "playlist" as Section, label: "مكتبتي", icon: "📋" },
    { id: "favorites" as Section, label: "المفضلة", icon: "❤️" },
  ];

  const hasPlayer = !!currentTrack;

  return (
    <div
      className="min-h-dvh bg-black flex flex-col"
      style={{ fontFamily: "inherit", paddingBottom: hasPlayer ? 100 : 0 }}
    >
      <div
        className="sticky top-0 z-30 px-4 py-3 flex items-center justify-between"
        style={{ background: "#000000dd", backdropFilter: "blur(16px)", borderBottom: "1px solid #1a1a1a" }}
      >
        <div dir="rtl">
          <p className="text-[#888] text-xs uppercase tracking-widest">PRIVATE STREAM</p>
          <h1 className="text-white font-bold text-lg leading-tight">music&sk</h1>
          <p className="text-[#1DB954] text-xs">أهلاً {userName} 👋</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onLogout}
            className="text-sm px-3 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95"
            style={{ background: "#111", border: "1px solid #333", color: "#888" }}
          >
            خروج
          </button>
        </div>
      </div>

      <div className="px-4 py-4" dir="rtl">
        <div
          className="rounded-2xl p-4 mb-4 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #0a1a0a, #111)" }}
        >
          <div>
            <p className="text-[#1DB954] text-xs font-bold uppercase tracking-wider mb-1">موسيقاك الخاصة</p>
            <p className="text-white font-bold text-lg">{playlist.length} أغنية في مكتبتك</p>
            <p className="text-[#666] text-xs mt-1">بحث سريع · تشغيل فوري · تحميل كامل</p>
          </div>
          <div className="flex items-end gap-[5px]">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="wave-bar bg-[#1DB954] rounded-full"
                style={{
                  width: 5,
                  height: 20 + (i % 3) * 8,
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: `${0.7 + (i % 3) * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 mb-3"
          style={{ background: "#111", border: "1px solid #222" }}
        >
          <span style={{ color: "#1DB954" }}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length > 1) setSection("search");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim().length > 1) {
                addHistory(query.trim());
                setSection("search");
              }
            }}
            placeholder="ابحث عن أي أغنية..."
            className="flex-1 bg-transparent outline-none text-white text-sm"
            style={{ fontFamily: "inherit", direction: "rtl" }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ color: "#555" }}>✕</button>
          )}
        </div>

        {history.length > 0 && section !== "playlist" && section !== "favorites" && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[#666]">بحث سابق</p>
              <button
                onClick={() => { setHistory([]); storage.setHistory([]); }}
                className="text-xs text-[#e22134]"
              >
                مسح
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {history.map((h) => (
                <button
                  key={h}
                  onClick={() => { setQuery(h); setSection("search"); }}
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-all hover:scale-105"
                  style={{ background: "#111", border: "1px solid #222", color: "#aaa" }}
                >
                  <span>🕐</span> {h}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK_SEARCHES.map((q2) => (
            <button
              key={q2}
              onClick={() => { setQuery(q2); setSection("search"); addHistory(q2); }}
              className="rounded-full px-3 py-1.5 text-xs font-medium transition-all hover:scale-105 active:scale-95"
              style={{
                background: query === q2 ? "#1DB954" : "#111",
                border: `1px solid ${query === q2 ? "#1DB954" : "#222"}`,
                color: query === q2 ? "#000" : "#aaa",
              }}
            >
              {q2}
            </button>
          ))}
        </div>

        {section === "home" && featured.length > 0 && (
          <div className="mb-4">
            <p className="text-white font-semibold text-sm mb-3">✨ مختارات</p>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {featured.map((t, i) => (
                <FeaturedCard
                  key={t.videoId}
                  track={t}
                  index={i}
                  onPlay={() => playTrack(t, featured)}
                />
              ))}
            </div>
            <p className="text-white font-semibold text-sm mt-4 mb-2">🎵 نتائج البحث</p>
          </div>
        )}

        {section !== "home" && (
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-semibold text-sm">
              {section === "playlist"
                ? `📋 مكتبتي (${playlist.length})`
                : section === "favorites"
                ? `❤️ المفضلة (${favorites.length})`
                : `🔍 نتائج البحث`}
            </p>
            {section === "playlist" && playlist.length > 0 && (
              <button
                onClick={() => {
                  playlist.forEach((t) => downloadTrack(t));
                }}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-bold transition-all hover:scale-105 active:scale-95"
                style={{ background: "#1DB954", color: "#000" }}
              >
                ⬇ تحميل الكل
              </button>
            )}
          </div>
        )}

        {search.isFetching && (section === "search" || section === "home") && (
          <div className="flex justify-center py-8">
            <div className="flex items-end gap-[5px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="wave-bar bg-[#1DB954] rounded-full"
                  style={{
                    width: 5,
                    height: 24,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {listData.length === 0 && !search.isFetching && (
          <div
            className="flex flex-col items-center py-12 rounded-2xl"
            style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}
          >
            <span className="text-4xl mb-3">
              {section === "favorites" ? "💔" : section === "playlist" ? "📭" : "🎵"}
            </span>
            <p className="text-white font-semibold">
              {section === "favorites"
                ? "لسه مفيش مفضلة"
                : section === "playlist"
                ? "القائمة فاضية"
                : "ابدأ البحث"}
            </p>
            <p className="text-[#555] text-sm mt-1">
              {section === "favorites" || section === "playlist"
                ? "دور على الأغاني وضيفها"
                : "اكتب اسم الأغنية أو الفنان"}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1">
          {listData.map((track, i) => (
            <TrackRow
              key={track.videoId}
              track={track}
              index={i}
              isCurrent={currentTrack?.videoId === track.videoId}
              isPlaying={currentTrack?.videoId === track.videoId}
              isFavorite={isFavorite(track.videoId)}
              inPlaylist={inPlaylist(track.videoId)}
              onPlay={() => playTrack(track, listData)}
              onFavorite={() => toggleFavorite(track)}
              onPlaylist={() => addToPlaylist(track)}
              onDownload={() => downloadTrack(track)}
              onRemove={section === "playlist" ? () => removeFromPlaylist(track.videoId) : undefined}
            />
          ))}
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-30 flex justify-around items-center px-4 py-3"
        style={{
          background: "#0a0a0a",
          borderTop: "1px solid #1a1a1a",
          bottom: hasPlayer ? 90 : 0,
        }}
      >
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className="flex flex-col items-center gap-1 transition-all hover:scale-110 active:scale-95 px-4 py-1"
          >
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <span
              className="text-xs font-medium"
              style={{ color: section === item.id ? "#1DB954" : "#555" }}
            >
              {item.label}
            </span>
            {section === item.id && (
              <div
                className="rounded-full"
                style={{ width: 4, height: 4, background: "#1DB954" }}
              />
            )}
          </button>
        ))}
      </div>

      {currentTrack && (
        <AudioPlayer
          track={currentTrack}
          queue={queue}
          onClose={() => setCurrentTrack(null)}
          onTrackChange={(t) => setCurrentTrack(t)}
        />
      )}
    </div>
  );
}

function FeaturedCard({ track, index, onPlay }: { track: StoredTrack; index: number; onPlay: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      onClick={onPlay}
      className="flex-shrink-0 text-right transition-all hover:scale-105 active:scale-95"
      style={{ width: 130 }}
      dir="rtl"
    >
      <div
        className="rounded-xl overflow-hidden mb-2 relative"
        style={{ width: 130, height: 130 }}
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
            className="w-full h-full flex items-center justify-center text-4xl"
            style={{ background: `hsl(${(index * 60) % 360}, 30%, 15%)` }}
          >
            🎵
          </div>
        )}
        <div
          className="absolute inset-0 flex items-end justify-start p-2"
          style={{ background: "linear-gradient(to top, #000000aa, transparent)" }}
        >
          <div
            className="rounded-full flex items-center justify-center"
            style={{ background: "#1DB954", width: 28, height: 28, fontSize: 12 }}
          >
            ▶
          </div>
        </div>
      </div>
      <p className="text-white text-xs font-semibold truncate">{track.title}</p>
      <p className="text-[#888] text-xs truncate">{track.artist}</p>
    </button>
  );
}

