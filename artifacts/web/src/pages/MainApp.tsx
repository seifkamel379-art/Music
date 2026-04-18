import { useState, useCallback, useMemo, useRef } from "react";
import { useSearchTracks } from "@workspace/api-client-react";
import { storage, type Track } from "@/lib/storage";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import TrackRow from "@/components/TrackRow";
import MiniPlayer from "@/components/MiniPlayer";
import PlayerModal from "@/components/PlayerModal";

type Section = "home" | "search" | "playlist" | "favorites";

const C = {
  background: "#000000", card: "#121212", primary: "#1DB954", primaryFg: "#000000",
  foreground: "#FFFFFF", secondary: "#1F1F1F", muted: "#181818",
  mutedFg: "#B3B3B3", border: "#2A2A2A", destructive: "#F15E6C",
  gold: "#1DB954", espresso: "#000000", sand: "#181818", input: "#242424",
};

const QUICK_SEARCHES = ["اغاني مصرية", "عمرو دياب", "ويجز", "تامر حسني", "أم كلثوم", "راب مصري"];
const COVERS = ["/cover-one.png", "/cover-two.png", "/cover-three.png"];

const NAV_ITEMS: { section: Section; label: string; icon: React.ReactNode }[] = [
  { section: "home", label: "الرئيسية", icon: <HomeIcon /> },
  { section: "search", label: "بحث", icon: <SearchIcon /> },
  { section: "playlist", label: "مكتبتك", icon: <ListIcon /> },
  { section: "favorites", label: "المفضلة", icon: <HeartIcon /> },
];

function apiToTrack(t: { videoId: string; title: string; artist: string; duration: string; thumbnail?: string | null; streamUrl: string }): Track {
  return { videoId: t.videoId, title: t.title, artist: t.artist, duration: t.duration, thumbnail: t.thumbnail ?? null, streamUrl: t.streamUrl };
}

function downloadTrack(track: Track) {
  const sep = track.streamUrl.includes("?") ? "&" : "?";
  const url = `${track.streamUrl}${sep}download=1&title=${encodeURIComponent(track.title)}`;
  const a = Object.assign(document.createElement("a"), { href: url, download: `${track.title}.mp3`, rel: "noopener" });
  document.body.appendChild(a); a.click(); a.remove();
}

interface Props { userName: string; onLogout: () => void; }

export default function MainApp({ userName, onLogout }: Props) {
  const [section, setSection] = useState<Section>("home");
  const [query, setQuery] = useState("اغاني مصرية");
  const [playlist, setPlaylist] = useState<Track[]>(() => storage.getPlaylist());
  const [favorites, setFavorites] = useState<Track[]>(() => storage.getFavorites());
  const [history, setHistory] = useState<string[]>(() => storage.getHistory());
  const [showPlayer, setShowPlayer] = useState(false);
  const { currentTrack, playTrack } = useAudioPlayer();

  const search = useSearchTracks({ q: query }, {
    query: { enabled: query.trim().length > 1, staleTime: 60000, retry: 1 },
  });

  const searchTracks: Track[] = useMemo(() => (search.data?.tracks ?? []).map(apiToTrack), [search.data]);

  const addHistory = useCallback((q: string) => {
    setHistory(prev => {
      const next = [q, ...prev.filter(x => x !== q)].slice(0, 10);
      storage.setHistory(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((track: Track) => {
    setFavorites(prev => {
      const exists = prev.some(t => t.videoId === track.videoId);
      const next = exists ? prev.filter(t => t.videoId !== track.videoId) : [track, ...prev];
      storage.setFavorites(next);
      return next;
    });
  }, []);

  const addToPlaylist = useCallback((track: Track) => {
    setPlaylist(prev => {
      if (prev.some(t => t.videoId === track.videoId)) return prev;
      const next = [...prev, track];
      storage.setPlaylist(next);
      return next;
    });
  }, []);

  const removeFromPlaylist = useCallback((videoId: string) => {
    setPlaylist(prev => { const next = prev.filter(t => t.videoId !== videoId); storage.setPlaylist(next); return next; });
  }, []);

  const isFav = useCallback((id: string) => favorites.some(t => t.videoId === id), [favorites]);

  const listData = useMemo(() => {
    if (section === "favorites") return favorites;
    if (section === "playlist") return playlist;
    return searchTracks;
  }, [section, favorites, playlist, searchTracks]);

  const featured = useMemo(() => (playlist.length > 0 ? playlist.slice(0, 6) : searchTracks.slice(0, 6)), [playlist, searchTracks]);

  const hasPlayer = !!currentTrack;

  return (
    <div style={{ minHeight: "100dvh", background: C.background, paddingBottom: hasPlayer ? 158 : 76 }}>

      {/* Scrollable content */}
      <div style={{ overflowY: "auto", height: "100dvh", paddingBottom: hasPlayer ? 158 : 76 }}>

        {/* Header */}
        <div style={{
          paddingInline: 18, paddingTop: 12, paddingBottom: 14,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          direction: "rtl",
        }}>
          <div>
            <div style={{ color: C.mutedFg, fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase" }}>PRIVATE STREAM</div>
            <div style={{ color: C.foreground, fontSize: 34, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.1 }}>music&sk</div>
            <div style={{ color: C.mutedFg, fontSize: 14, fontWeight: 500, marginTop: 4 }}>أهلاً {userName}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={onLogout}
              style={{
                width: 46, height: 46, borderRadius: 23, background: C.card,
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
              title="خروج"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>

        {/* Hero card */}
        <div style={{
          marginInline: 18, borderRadius: 22, padding: 18, minHeight: 140,
          background: C.espresso, display: "flex", justifyContent: "space-between",
          alignItems: "center", overflow: "hidden",
          border: `1px solid ${C.border}`,
          direction: "rtl",
        }}>
          <div style={{ flex: 1, zIndex: 1 }}>
            <div style={{ color: C.gold, fontSize: 13, fontWeight: 700 }}>موسيقاك الخاصة</div>
            <div style={{ color: "#fff", fontSize: 27, fontWeight: 700, marginTop: 6, letterSpacing: -0.6 }}>
              {playlist.length} أغنية في مكتبتك
            </div>
            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: "19px", marginTop: 8, fontWeight: 500 }}>
              بحث سريع · تشغيل فوري · تحميل كامل
            </div>
          </div>
          <div style={{ width: 128, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }}>
            <div style={{
              width: 92, height: 92, borderRadius: 46, borderWidth: 2, borderStyle: "solid",
              borderColor: C.gold, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.06)",
            }}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            {[72, 48, 32].map((h, i) => (
              <div key={i} className="wave-bar" style={{
                width: 7, height: h, borderRadius: 999, background: C.gold, opacity: 0.85,
                animationDelay: `${i * 0.12}s`,
              }} />
            ))}
          </div>
        </div>

        {/* Search box */}
        <div style={{
          marginInline: 18, marginTop: 16, height: 54, borderRadius: 22,
          border: `1px solid ${C.border}`, paddingInline: 16,
          display: "flex", alignItems: "center", gap: 10,
          background: C.card, direction: "rtl",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); if (e.target.value.trim().length > 1) setSection("search"); }}
            onKeyDown={e => { if (e.key === "Enter" && query.trim().length > 1) { addHistory(query.trim()); setSection("search"); } }}
            placeholder="ابحث عن أي أغنية"
            style={{
              flex: 1, height: 52, fontSize: 16, fontWeight: 600, background: "transparent",
              border: "none", outline: "none", color: C.foreground, fontFamily: "inherit",
              textAlign: "right", direction: "rtl",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: C.mutedFg, display: "flex" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Search history */}
        {history.length > 0 && section !== "playlist" && section !== "favorites" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingInline: 20, paddingTop: 10, paddingBottom: 2, direction: "rtl" }}>
              <span style={{ color: C.mutedFg, fontWeight: 700, fontSize: 12 }}>بحث سابق</span>
              <button onClick={() => { setHistory([]); storage.setHistory([]); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.destructive, fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}>مسح</button>
            </div>
            <div style={{ display: "flex", flexWrap: "nowrap", overflowX: "auto", gap: 8, paddingInline: 18, paddingBlock: 8, scrollbarWidth: "none" }}>
              {history.map(h => (
                <button key={h} onClick={() => { setQuery(h); setSection("search"); }}
                  style={{
                    borderRadius: 999, border: `1px solid ${C.border}`, padding: "9px 13px",
                    display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                    background: C.card, cursor: "pointer", color: C.foreground, fontFamily: "inherit",
                    fontSize: 13, fontWeight: 700,
                  }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.mutedFg} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {h}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Quick search chips */}
        <div style={{ display: "flex", flexWrap: "nowrap", overflowX: "auto", gap: 8, paddingInline: 18, paddingBlock: 8, scrollbarWidth: "none" }}>
          {QUICK_SEARCHES.map(q2 => (
            <button key={q2} onClick={() => { setQuery(q2); setSection("search"); addHistory(q2); }}
              style={{
                borderRadius: 999, border: `1px solid ${C.border}`, padding: "9px 13px",
                whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: 700,
                background: query === q2 ? C.primary : C.card,
                color: query === q2 ? C.primaryFg : C.foreground,
              }}>
              {q2}
            </button>
          ))}
        </div>

        {/* Featured + section headers */}
        {section === "home" && featured.length > 0 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, marginInline: 18, marginTop: 20, marginBottom: 10, color: C.foreground, direction: "rtl" }}>مختارات</div>
            <div style={{ display: "flex", overflowX: "auto", gap: 12, paddingInline: 18, paddingBottom: 8, scrollbarWidth: "none" }}>
              {featured.map((t, i) => (
                <FeaturedCard key={t.videoId} track={t} index={i} onPlay={() => playTrack(t, featured)} />
              ))}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, marginInline: 18, marginTop: 20, marginBottom: 10, color: C.foreground, direction: "rtl" }}>نتائج البحث</div>
          </>
        )}

        {section !== "home" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 18, direction: "rtl" }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginInline: 18, marginTop: 20, marginBottom: 10, color: C.foreground }}>
              {section === "playlist" ? `مكتبتك (${playlist.length})` : section === "favorites" ? `المفضلة (${favorites.length})` : "نتائج البحث"}
            </div>
            {section === "playlist" && playlist.length > 0 && (
              <button
                onClick={() => playlist.forEach(t => downloadTrack(t))}
                style={{
                  display: "flex", alignItems: "center", gap: 6, borderRadius: 999,
                  padding: "9px 13px", marginTop: 12, background: C.primary,
                  border: "none", cursor: "pointer", color: C.primaryFg,
                  fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                تحميل الكل
              </button>
            )}
          </div>
        )}

        {/* Loading */}
        {search.isFetching && (section === "search" || section === "home") && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 5, padding: "20px 0" }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="wave-bar" style={{ width: 5, height: 24, background: C.primary, borderRadius: 999, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {listData.length === 0 && !search.isFetching && (
          <div style={{
            margin: 18, borderRadius: 22, border: `1px solid ${C.border}`,
            padding: 24, display: "flex", flexDirection: "column", alignItems: "center",
            background: C.card, direction: "rtl",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            <div style={{ marginTop: 10, fontSize: 17, fontWeight: 700, color: C.foreground }}>
              {section === "favorites" ? "لسه مفيش مفضلة" : section === "playlist" ? "القائمة فاضية" : "ابدأ البحث"}
            </div>
            <div style={{ marginTop: 6, textAlign: "center", lineHeight: "20px", fontWeight: 500, color: C.mutedFg, fontSize: 14 }}>
              {section === "playlist" || section === "favorites" ? "دور على الأغاني وضيفها للقائمة أو المفضلة" : "اكتب اسم الأغنية أو الفنان"}
            </div>
          </div>
        )}

        {/* Track list */}
        {listData.map((track, i) => (
          <TrackRow
            key={track.videoId} track={track} index={i}
            isCurrent={currentTrack?.videoId === track.videoId}
            isPlaying={currentTrack?.videoId === track.videoId}
            isFavorite={isFav(track.videoId)}
            onPlay={() => playTrack(track, listData)}
            onFavorite={() => toggleFavorite(track)}
            onPlaylist={() => addToPlaylist(track)}
            onDownload={() => downloadTrack(track)}
            onRemove={section === "playlist" ? () => removeFromPlaylist(track.videoId) : undefined}
          />
        ))}
      </div>

      {/* Mini player (floating above bottom nav) */}
      {hasPlayer && <MiniPlayer onOpenPlayer={() => setShowPlayer(true)} />}

      {/* Bottom nav */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, height: 76,
        background: C.espresso, borderTop: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-around",
        paddingTop: 8, paddingBottom: 10, zIndex: 20,
      }}>
        {NAV_ITEMS.map(item => {
          const active = section === item.section;
          return (
            <button key={item.section} onClick={() => setSection(item.section)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 4, background: "none", border: "none", cursor: "pointer",
              color: active ? C.primary : C.mutedFg,
            }}>
              <div style={{ color: active ? C.primary : C.mutedFg }}>{item.icon}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, fontFamily: "inherit", color: active ? C.primary : C.mutedFg }}>
                {item.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Full player modal */}
      {showPlayer && <PlayerModal onClose={() => setShowPlayer(false)} />}
    </div>
  );
}

function FeaturedCard({ track, index, onPlay }: { track: Track; index: number; onPlay: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      onClick={onPlay}
      style={{
        width: 140, borderRadius: 22, padding: 10, background: C.card,
        border: "none", cursor: "pointer", flexShrink: 0, textAlign: "right", direction: "rtl",
      }}
    >
      <div style={{ width: "100%", height: 120, borderRadius: 16, marginBottom: 8, overflow: "hidden", position: "relative" }}>
        {track.thumbnail && !imgErr ? (
          <img src={track.thumbnail} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <img src={COVERS[index % 3]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </div>
      <div style={{ fontSize: 13, lineHeight: "17px", fontWeight: 700, color: C.foreground, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {track.title}
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, marginTop: 3, color: C.mutedFg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {track.artist}
      </div>
    </button>
  );
}

// SVG Icons
function HomeIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
}
function SearchIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function ListIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
}
function HeartIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
}
function LogoutIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1DB954" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
}
