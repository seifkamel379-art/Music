import React, { useState, useCallback, useRef, useEffect } from "react";
import { searchTracks as apiSearch } from "@/lib/piped";
import { storage, type Track } from "@/lib/storage";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useTheme } from "@/contexts/ThemeContext";
import MiniPlayer from "@/components/MiniPlayer";
import PlayerModal from "@/components/PlayerModal";

type Tab = "home" | "search" | "library" | "device";
type DeviceTrack = { id: string; title: string; artist: string; url: string };

const SECTIONS = [
  { label: "اتجاهات 2026", query: "اغاني 2026 trending" },
  { label: "Sabrina Carpenter", query: "Sabrina Carpenter 2025 2026" },
  { label: "Kendrick Lamar", query: "Kendrick Lamar 2025 2026" },
  { label: "Bad Bunny", query: "Bad Bunny 2025 2026" },
  { label: "Billie Eilish", query: "Billie Eilish 2025 2026" },
  { label: "Drake", query: "Drake 2025 2026" },
  { label: "اغاني عربية 2026", query: "اغاني عربية جديدة 2026" },
  { label: "ويجز", query: "ويجز 2025 2026" },
  { label: "The Weeknd", query: "The Weeknd 2025 2026" },
  { label: "Dua Lipa", query: "Dua Lipa 2025 2026" },
  { label: "راب مصري", query: "راب مصري 2025 2026" },
  { label: "Tyler The Creator", query: "Tyler The Creator 2025 2026" },
  { label: "SZA", query: "SZA 2025 2026" },
  { label: "Travis Scott", query: "Travis Scott 2025 2026" },
  { label: "Rema Afrobeats", query: "Rema Afrobeats 2025 2026" },
  { label: "Burna Boy", query: "Burna Boy 2025 2026" },
  { label: "Peso Pluma", query: "Peso Pluma 2025 2026" },
  { label: "Olivia Rodrigo", query: "Olivia Rodrigo 2025 2026" },
  { label: "Morgan Wallen", query: "Morgan Wallen 2025 2026" },
  { label: "Zach Bryan", query: "Zach Bryan 2025 2026" },
];

const SECTION_COLORS = [
  "#1e3264","#7358ff","#e8115b","#eb1e32","#8d67ab",
  "#477d95","#608108","#e91429","#1e3264","#148a08",
  "#f59b23","#0d73ec","#503750","#27856a","#4b917d",
  "#148a08","#777","#e8115b","#1e3264","#8d67ab",
];

const BROWSE_CATEGORIES = [
  { label: "بوب", color: "#e8115b", query: "pop music 2026" },
  { label: "راب / هيب هوب", color: "#ba5d07", query: "rap hip hop 2026" },
  { label: "R&B", color: "#477d95", query: "r&b 2026" },
  { label: "عربي", color: "#1e3264", query: "arabic music 2026" },
  { label: "لاتيني", color: "#e91429", query: "latin music 2026" },
  { label: "أفروبيتس", color: "#148a08", query: "afrobeats 2026" },
  { label: "روك", color: "#7358ff", query: "rock music 2026" },
  { label: "كانتري", color: "#8d67ab", query: "country music 2026" },
  { label: "إلكتروني", color: "#0d73ec", query: "electronic music 2026" },
  { label: "جاز", color: "#27856a", query: "jazz 2026" },
  { label: "كلاسيكي", color: "#503750", query: "classical music 2026" },
  { label: "ميتال", color: "#333", query: "metal music 2026" },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 18) return "مساء النور";
  return "مساء الخير";
}

function safeTitle(name: string) {
  return name.replace(/\.[^/.]+$/, "").slice(0, 60) || "أغنية";
}

interface Props { userName: string; onLogout: () => void; }

export default function MainApp({ userName, onLogout }: Props) {
  const { colors, themeMode, toggleTheme } = useTheme();
  const [tab, setTab] = useState<Tab>("home");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playlist, setPlaylist] = useState<Track[]>(() => storage.getPlaylist());
  const [favorites, setFavorites] = useState<Track[]>(() => storage.getFavorites());
  const [history, setHistory] = useState<string[]>(() => storage.getHistory());
  const [sectionTracks, setSectionTracks] = useState<Record<number, Track[]>>({});
  const [sectionLoading, setSectionLoading] = useState<Record<number, boolean>>({});
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [deviceTracks, setDeviceTracks] = useState<DeviceTrack[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedSections = useRef<Set<number>>(new Set());
  const { currentTrack, playTrack } = useAudioPlayer();

  const bg = colors.background;
  const navBg = themeMode === "dark" ? "#0a0a0a" : colors.card;
  const navBorder = themeMode === "dark" ? "#1a1a1a" : colors.border;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    [0, 1, 2].forEach(i => loadSection(i));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    const t = setTimeout(() => {
      apiSearch(q)
        .then(r => {
          setSearchResults(r as Track[]);
          if (r.length > 0) {
            setHistory(prev => {
              const next = [q, ...prev.filter(x => x !== q)].slice(0, 20);
              storage.setHistory(next);
              return next;
            });
          }
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 600);
    return () => clearTimeout(t);
  }, [query]);

  function loadSection(idx: number) {
    if (loadedSections.current.has(idx)) return;
    loadedSections.current.add(idx);
    setSectionLoading(p => ({ ...p, [idx]: true }));
    apiSearch(SECTIONS[idx].query)
      .then(tracks => setSectionTracks(p => ({ ...p, [idx]: tracks as Track[] })))
      .catch(() => {})
      .finally(() => setSectionLoading(p => ({ ...p, [idx]: false })));
  }

  const toggleFavorite = useCallback((track: Track) => {
    setFavorites(prev => {
      const next = prev.some(t => t.videoId === track.videoId)
        ? prev.filter(t => t.videoId !== track.videoId)
        : [track, ...prev];
      storage.setFavorites(next);
      return next;
    });
  }, []);

  const addToPlaylist = useCallback((track: Track) => {
    setPlaylist(prev => {
      if (prev.some(t => t.videoId === track.videoId)) {
        showToast("الأغنية موجودة بالفعل في مكتبتك");
        return prev;
      }
      const next = [...prev, track];
      storage.setPlaylist(next);
      showToast("أضيفت للمكتبة");
      return next;
    });
  }, []);

  const removeFromPlaylist = useCallback((id: string) => {
    setPlaylist(prev => {
      const next = prev.filter(t => t.videoId !== id);
      storage.setPlaylist(next);
      return next;
    });
  }, []);

  const isFav = useCallback((id: string) => favorites.some(t => t.videoId === id), [favorites]);

  function handleDownload(track: Track) {
    const url = `/api/music/download?id=${encodeURIComponent(track.videoId)}&title=${encodeURIComponent(track.title)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${track.title}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("جارٍ تحضير التحميل...");
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const newTracks: DeviceTrack[] = [];
    files.forEach((f, i) => {
      const id = `device-${Date.now()}-${i}-${f.name}`;
      const url = URL.createObjectURL(f);
      newTracks.push({ id, title: safeTitle(f.name), artist: "ملفاتك", url });
    });
    setDeviceTracks(prev => [...prev, ...newTracks]);
    e.target.value = "";
  }

  function playDevice(dt: DeviceTrack) {
    const t: Track = { videoId: dt.id, title: dt.title, artist: dt.artist, duration: "", thumbnail: null, streamUrl: dt.url };
    const all = deviceTracks.map(d => ({ videoId: d.id, title: d.title, artist: d.artist, duration: "", thumbnail: null, streamUrl: d.url }));
    playTrack(t, all);
  }

  const deleteFromHistory = useCallback((q: string) => {
    setHistory(prev => {
      const next = prev.filter(x => x !== q);
      storage.setHistory(next);
      return next;
    });
  }, []);

  function searchCategory(q: string) {
    setTab("search");
    setQuery(q);
    const h = [q, ...history.filter(x => x !== q)].slice(0, 20);
    setHistory(h); storage.setHistory(h);
  }

  const hasPlayer = !!currentTrack;

  return (
    <div style={{ minHeight: "100dvh", background: bg, display: "flex", flexDirection: "column", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {showPlayer && (
        <PlayerModal
          onClose={() => setShowPlayer(false)}
          isFav={currentTrack ? isFav(currentTrack.videoId) : false}
          onFavorite={() => { if (currentTrack) toggleFavorite(currentTrack); }}
          onDownload={() => { if (currentTrack) handleDownload(currentTrack); }}
          isDownloading={currentTrack ? downloadingIds.has(currentTrack.videoId) : false}
        />
      )}

      <input ref={fileInputRef} type="file" accept="audio/*" multiple style={{ display: "none" }} onChange={handleFileInput} />

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: hasPlayer ? 160 : 86, left: "50%", transform: "translateX(-50%)",
          background: "#282828", color: "#fff", padding: "10px 20px", borderRadius: 100,
          fontSize: 13, fontWeight: 600, zIndex: 200, whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)", animation: "fade-in 0.2s ease",
        }}>
          {toast}
        </div>
      )}

      {/* SCROLLABLE CONTENT */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: hasPlayer ? 152 : 80 }}>

        {/* HOME */}
        {tab === "home" && (
          <HomeTab
            userName={userName}
            colors={colors}
            themeMode={themeMode}
            toggleTheme={toggleTheme}
            playlist={playlist}
            favorites={favorites}
            sections={SECTIONS}
            sectionTracks={sectionTracks}
            sectionLoading={sectionLoading}
            currentTrack={currentTrack}
            isFav={isFav}
            downloadingIds={downloadingIds}
            onSectionVisible={(idx: number) => loadSection(idx)}
            onPlaySection={(track: Track, all: Track[]) => playTrack(track, all)}
            onFavorite={toggleFavorite}
            onPlaylist={addToPlaylist}
            onDownload={handleDownload}
            onPlayPlaylist={() => { if (playlist.length) playTrack(playlist[0], playlist); }}
            onPlayFavorites={() => { if (favorites.length) playTrack(favorites[0], favorites); }}
            onLogout={onLogout}
          />
        )}

        {/* SEARCH */}
        {tab === "search" && (
          <SearchTab
            query={query}
            setQuery={setQuery}
            results={searchResults}
            loading={searchLoading}
            history={history}
            colors={colors}
            themeMode={themeMode}
            currentTrack={currentTrack}
            isFav={isFav}
            downloadingIds={downloadingIds}
            onPlay={(track: Track) => playTrack(track, searchResults)}
            onFavorite={toggleFavorite}
            onPlaylist={addToPlaylist}
            onDownload={handleDownload}
            onHistoryClick={(q: string) => { setQuery(q); }}
            onClearHistory={() => { setHistory([]); storage.setHistory([]); }}
            onDeleteHistory={deleteFromHistory}
            onCategoryClick={searchCategory}
          />
        )}

        {/* LIBRARY */}
        {tab === "library" && (
          <LibraryTab
            playlist={playlist}
            favorites={favorites}
            colors={colors}
            currentTrack={currentTrack}
            isFav={isFav}
            downloadingIds={downloadingIds}
            onPlay={(track: Track, list: Track[]) => playTrack(track, list)}
            onFavorite={toggleFavorite}
            onRemove={removeFromPlaylist}
            onDownload={handleDownload}
          />
        )}

        {/* DEVICE */}
        {tab === "device" && (
          <DeviceTab
            tracks={deviceTracks}
            colors={colors}
            currentTrack={currentTrack}
            onAdd={() => fileInputRef.current?.click()}
            onPlay={playDevice}
            onRemove={(id: string) => setDeviceTracks(prev => prev.filter(t => t.id !== id))}
          />
        )}
      </div>

      {/* MINI PLAYER */}
      {hasPlayer && <MiniPlayer onOpenPlayer={() => setShowPlayer(true)} />}

      {/* BOTTOM NAV */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, height: 80,
        background: navBg, borderTop: `1px solid ${navBorder}`,
        display: "flex", alignItems: "center", justifyContent: "space-around",
        zIndex: 40, paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {([
          { key: "home", label: "الرئيسية", icon: (a: boolean) => <HomeIcon active={a} color={colors.foreground} /> },
          { key: "search", label: "استكشاف", icon: (a: boolean) => <SearchIcon active={a} color={colors.foreground} /> },
          { key: "library", label: "مكتبتي", icon: (a: boolean) => <LibraryIcon active={a} color={colors.foreground} /> },
          { key: "device", label: "جهازي", icon: (a: boolean) => <DeviceIcon active={a} color={colors.foreground} /> },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as Tab)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              background: "none", border: "none", cursor: "pointer", padding: "6px 14px",
              opacity: tab === key ? 1 : 0.5,
              transition: "opacity 0.15s",
            }}
          >
            {icon(tab === key)}
            <span style={{ color: tab === key ? colors.foreground : colors.mutedForeground, fontSize: 10, fontWeight: 700 }}>
              {label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ===================== HOME TAB ===================== */
function HomeTab({ userName, colors, themeMode, toggleTheme, playlist, favorites, sections, sectionTracks, sectionLoading, currentTrack, isFav, downloadingIds, onSectionVisible, onPlaySection, onFavorite, onPlaylist, onDownload, onPlayPlaylist, onPlayFavorites, onLogout }: any) {
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "52px 16px 8px", direction: "rtl" }}>
        <div style={{ color: colors.foreground, fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{greeting()}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            style={{ width: 34, height: 34, borderRadius: "50%", background: colors.secondary, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}
          >
            {themeMode === "dark"
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.foreground} strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.foreground} strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          {/* Logout */}
          <button
            onClick={onLogout}
            style={{ width: 34, height: 34, borderRadius: "50%", background: colors.secondary, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.foreground} strokeWidth="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Quick picks */}
      {(playlist.length > 0 || favorites.length > 0) && (
        <div style={{ padding: "8px 16px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, direction: "rtl" }}>
          {playlist.length > 0 && (
            <QuickCard label="مكتبتي" count={playlist.length} onClick={onPlayPlaylist} color="#1e3264" colors={colors}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>}
            />
          )}
          {favorites.length > 0 && (
            <QuickCard label="المفضلة" count={favorites.length} onClick={onPlayFavorites} color="#8d67ab" colors={colors}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}
            />
          )}
        </div>
      )}

      {/* Sections */}
      {sections.map((sec: typeof SECTIONS[0], idx: number) => (
        <SectionRow
          key={sec.query}
          title={sec.label}
          tracks={sectionTracks[idx] || []}
          loading={sectionLoading[idx]}
          colors={colors}
          currentTrack={currentTrack}
          isFav={isFav}
          downloadingIds={downloadingIds}
          onVisible={() => onSectionVisible(idx)}
          onPlay={(track: Track) => onPlaySection(track, sectionTracks[idx] || [])}
          onFavorite={onFavorite}
          onPlaylist={onPlaylist}
          onDownload={onDownload}
          accentColor={SECTION_COLORS[idx % SECTION_COLORS.length]}
        />
      ))}
      <div style={{ height: 16 }} />
    </div>
  );
}

function QuickCard({ label, count, onClick, color, colors, icon }: any) {
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, background: colors.secondary, border: "none", borderRadius: 6, padding: 0, cursor: "pointer", overflow: "hidden", height: 56, direction: "rtl", width: "100%", transition: "opacity 0.15s" }}
    >
      <div style={{ width: 56, height: 56, background: color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <span style={{ color: colors.foreground, fontSize: 13, fontWeight: 700, flex: 1, textAlign: "right", paddingRight: 4 }}>{label}</span>
    </button>
  );
}

function SectionRow({ title, tracks, loading, colors, currentTrack, isFav, downloadingIds, onVisible, onPlay, onFavorite, onPlaylist, onDownload, accentColor }: any) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !visible) { setVisible(true); onVisible(); }
    }, { rootMargin: "300px" });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ marginTop: 28 }}>
      <div style={{ paddingInline: 16, marginBottom: 12, direction: "rtl" }}>
        <span style={{ color: colors.foreground, fontSize: 18, fontWeight: 700 }}>{title}</span>
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingInline: 16, scrollbarWidth: "none", paddingBottom: 4 }}>
        {loading && Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} colors={colors} />
        ))}
        {!loading && tracks.map((track: Track) => (
          <TrackCard
            key={track.videoId}
            track={track}
            colors={colors}
            isCurrent={currentTrack?.videoId === track.videoId}
            isFav={isFav(track.videoId)}
            isDownloading={downloadingIds.has(track.videoId)}
            onPlay={() => onPlay(track)}
            onFavorite={() => onFavorite(track)}
            onPlaylist={() => onPlaylist(track)}
            onDownload={() => onDownload(track)}
            accentColor={accentColor}
          />
        ))}
      </div>
    </div>
  );
}

function TrackCard({ track, colors, isCurrent, isFav, isDownloading, onPlay, onFavorite, onPlaylist, onDownload, accentColor }: any) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div style={{ flexShrink: 0, width: 148 }}>
      {/* Thumbnail */}
      <div
        onClick={onPlay}
        style={{ width: 148, height: 148, borderRadius: 6, overflow: "hidden", marginBottom: 6, position: "relative", background: accentColor, cursor: "pointer" }}
      >
        {track.thumbnail && !imgErr
          ? <img src={track.thumbnail} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
        }
        {isCurrent && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 24 }}>
              {[0,1,2].map(i => <div key={i} className="wave-bar" style={{ width: 4, height: 16, background: "#1DB954", borderRadius: 2, animationDelay: `${i*0.15}s` }} />)}
            </div>
          </div>
        )}
      </div>

      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <div onClick={onPlay} style={{ color: isCurrent ? "#1DB954" : colors.foreground, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: "pointer", lineHeight: "18px" }}>
          {track.title}
        </div>
        <button
          onClick={onFavorite}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0", flexShrink: 0, display: "flex", lineHeight: 1 }}
        >
          <HeartIcon filled={isFav} size={15} />
        </button>
      </div>

      {/* Artist + actions row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginTop: 2 }}>
        <div onClick={onPlay} style={{ color: colors.mutedForeground, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: "pointer" }}>
          {track.artist}
        </div>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <button onClick={onPlaylist} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0", display: "flex", lineHeight: 1 }}>
            <PlusIcon size={14} color={colors.mutedForeground} />
          </button>
          <button onClick={onDownload} disabled={isDownloading} style={{ background: "none", border: "none", cursor: isDownloading ? "default" : "pointer", padding: "2px 0", display: "flex", lineHeight: 1 }}>
            <DownloadIcon loading={isDownloading} size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ colors }: { colors: any }) {
  const sk = colors.secondary;
  return (
    <div style={{ flexShrink: 0, width: 148 }}>
      <div style={{ width: 148, height: 148, borderRadius: 6, background: sk, marginBottom: 8, animation: "skeleton-pulse 1.5s ease-in-out infinite" }} />
      <div style={{ height: 13, background: sk, borderRadius: 4, marginBottom: 6, animation: "skeleton-pulse 1.5s ease-in-out infinite" }} />
      <div style={{ height: 11, background: sk, borderRadius: 4, width: "70%", animation: "skeleton-pulse 1.5s ease-in-out infinite" }} />
    </div>
  );
}

/* ===================== SEARCH TAB ===================== */
function SearchTab({ query, setQuery, results, loading, history, colors, themeMode, currentTrack, isFav, downloadingIds, onPlay, onFavorite, onPlaylist, onDownload, onHistoryClick, onClearHistory, onDeleteHistory, onCategoryClick }: any) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const searchBg = themeMode === "dark" ? "#fff" : colors.input;
  const searchTextColor = themeMode === "dark" ? "#121212" : colors.foreground;

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  return (
    <div style={{ paddingTop: 52 }}>
      <div style={{ padding: "0 16px 16px", direction: "rtl" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: colors.foreground, marginBottom: 16 }}>استكشاف</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: searchBg, borderRadius: 6, padding: "10px 14px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={searchTextColor} strokeWidth="2.5" style={{ opacity: 0.6 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ما الذي تريد الاستماع إليه؟"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, fontWeight: 500, color: searchTextColor, textAlign: "right", direction: "rtl", fontFamily: "inherit" }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: searchTextColor, display: "flex", opacity: 0.5 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* History */}
      {!query && history.length > 0 && (
        <div style={{ padding: "0 16px", direction: "rtl" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: historyOpen ? 12 : 0 }}>
            <button
              onClick={() => setHistoryOpen(o => !o)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: 0 }}
            >
              <span style={{ color: colors.foreground, fontWeight: 700, fontSize: 16 }}>عمليات البحث الأخيرة</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth="2.5" style={{ transition: "transform 0.2s", transform: historyOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {historyOpen && (
              <button onClick={onClearHistory} style={{ background: "none", border: "none", cursor: "pointer", color: colors.mutedForeground, fontSize: 13 }}>مسح الكل</button>
            )}
          </div>
          {historyOpen && history.map((h: string) => (
            <div key={h} style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${colors.border}`, direction: "rtl" }}>
              <div onClick={() => onHistoryClick(h)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer", flex: 1, minWidth: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span style={{ color: colors.foreground, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h}</span>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onDeleteHistory(h); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", display: "flex", alignItems: "center", flexShrink: 0, opacity: 0.5 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Categories */}
      {!query && (
        <div style={{ padding: "16px 16px 0", direction: "rtl" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.foreground, marginBottom: 12 }}>تصفح حسب الفئة</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {BROWSE_CATEGORIES.map(cat => (
              <button
                key={cat.label}
                onClick={() => onCategoryClick(cat.query)}
                style={{ height: 80, borderRadius: 8, background: cat.color, border: "none", cursor: "pointer", display: "flex", alignItems: "flex-end", padding: "10px 12px", direction: "rtl", transition: "opacity 0.15s" }}
              >
                <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {query && (
        <div style={{ padding: "0 16px", direction: "rtl" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid " + colors.border, borderTopColor: "#1DB954", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}
          {!loading && results.length === 0 && query.length > 1 && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: colors.foreground, marginBottom: 8 }}>لا توجد نتائج</div>
              <div style={{ fontSize: 14, color: colors.mutedForeground }}>حاول بكلمات أخرى</div>
            </div>
          )}
          {results.map((track: Track) => (
            <TrackRow
              key={track.videoId}
              track={track}
              colors={colors}
              isCurrent={currentTrack?.videoId === track.videoId}
              isFav={isFav(track.videoId)}
              isDownloading={downloadingIds.has(track.videoId)}
              onPlay={() => onPlay(track)}
              onFavorite={() => onFavorite(track)}
              onPlaylist={() => onPlaylist(track)}
              onDownload={() => onDownload(track)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================== LIBRARY TAB ===================== */
function LibraryTab({ playlist, favorites, colors, currentTrack, isFav, downloadingIds, onPlay, onFavorite, onRemove, onDownload }: any) {
  const [activeList, setActiveList] = useState<"playlist" | "favorites">("playlist");
  const tracks = activeList === "playlist" ? playlist : favorites;

  return (
    <div style={{ paddingTop: 52, direction: "rtl" }}>
      <div style={{ padding: "0 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: colors.foreground, fontSize: 22, fontWeight: 700 }}>مكتبتي</span>
        {tracks.length > 0 && (
          <button
            onClick={() => onPlay(tracks[0], tracks)}
            style={{ width: 36, height: 36, borderRadius: "50%", background: "#1DB954", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#000"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
        {([["playlist", "المكتبة"], ["favorites", "المفضلة"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveList(key)}
            style={{
              borderRadius: 999, padding: "6px 16px",
              background: activeList === key ? colors.foreground : colors.secondary,
              border: "none", cursor: "pointer",
              color: activeList === key ? colors.background : colors.foreground,
              fontSize: 13, fontWeight: 700, transition: "background 0.2s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tracks.length === 0 && (
        <div style={{ padding: "40px 16px", textAlign: "center" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth="1.5" style={{ margin: "0 auto 16px", display: "block" }}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <div style={{ color: colors.foreground, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>القائمة فارغة</div>
          <div style={{ color: colors.mutedForeground, fontSize: 14 }}>ابحث عن أغاني وأضفها هنا</div>
        </div>
      )}

      {tracks.map((track: Track) => (
        <TrackRow
          key={track.videoId}
          track={track}
          colors={colors}
          isCurrent={currentTrack?.videoId === track.videoId}
          isFav={isFav(track.videoId)}
          isDownloading={downloadingIds.has(track.videoId)}
          onPlay={() => onPlay(track, tracks)}
          onFavorite={() => onFavorite(track)}
          onPlaylist={undefined}
          onDownload={() => onDownload(track)}
          onRemove={activeList === "playlist" ? () => onRemove(track.videoId) : undefined}
          padding="0 16px"
        />
      ))}
    </div>
  );
}

/* ===================== DEVICE TAB ===================== */
function DeviceTab({ tracks, colors, currentTrack, onAdd, onPlay, onRemove }: any) {
  return (
    <div style={{ paddingTop: 52, direction: "rtl" }}>
      <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: colors.foreground, fontSize: 22, fontWeight: 700 }}>موسيقى جهازي</div>
          <div style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>تشغيل محلي - لا ترسل لأي مكان</div>
        </div>
        <button onClick={onAdd} style={{ width: 36, height: 36, borderRadius: "50%", background: "#1DB954", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      {tracks.length === 0 && (
        <div style={{ padding: "40px 16px", textAlign: "center" }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth="1.2" style={{ margin: "0 auto 16px", display: "block" }}><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 13h6M9 17h4M9 9h6"/></svg>
          <div style={{ color: colors.foreground, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>لا توجد ملفات</div>
          <div style={{ color: colors.mutedForeground, fontSize: 14, marginBottom: 24, lineHeight: "20px" }}>اضغط + لإضافة ملفات صوتية من جهازك</div>
          <button onClick={onAdd} style={{ padding: "14px 32px", borderRadius: 999, background: "#1DB954", border: "none", cursor: "pointer", color: "#000", fontSize: 16, fontWeight: 700 }}>
            إضافة ملفات
          </button>
        </div>
      )}

      {tracks.map((dt: DeviceTrack) => (
        <div
          key={dt.id}
          onClick={() => onPlay(dt)}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", cursor: "pointer", borderBottom: `1px solid ${colors.border}`, direction: "rtl" }}
        >
          <div style={{ width: 48, height: 48, borderRadius: 6, background: colors.secondary, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {currentTrack?.videoId === dt.id
              ? <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>{[0,1,2].map(i => <div key={i} className="wave-bar" style={{ width: 3, height: 12, background: "#1DB954", borderRadius: 2, animationDelay: `${i*0.15}s` }} />)}</div>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: currentTrack?.videoId === dt.id ? "#1DB954" : colors.foreground, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dt.title}</div>
            <div style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>{dt.artist}</div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onRemove(dt.id); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 8, color: colors.mutedForeground, opacity: 0.6 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ===================== TRACK ROW (List) ===================== */
function TrackRow({ track, colors, isCurrent, isFav, isDownloading, onPlay, onFavorite, onPlaylist, onDownload, onRemove, padding = "6px 0" }: any) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding, borderBottom: `1px solid ${colors.border}`, direction: "rtl" }}>
      {/* Thumbnail */}
      <div
        onClick={onPlay}
        style={{ width: 50, height: 50, borderRadius: 4, overflow: "hidden", flexShrink: 0, background: colors.secondary, cursor: "pointer", position: "relative" }}
      >
        {track.thumbnail && !imgErr
          ? <img src={track.thumbnail} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
        }
        {isCurrent && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
              {[0,1,2].map(i => <div key={i} className="wave-bar" style={{ width: 3, height: 12, background: "#1DB954", borderRadius: 2, animationDelay: `${i*0.15}s` }} />)}
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div onClick={onPlay} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        <div style={{ color: isCurrent ? "#1DB954" : colors.foreground, fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.title}
        </div>
        <div style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.artist}{track.duration ? ` · ${track.duration}` : ""}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
        <button onClick={e => { e.stopPropagation(); onFavorite(); }} style={iconBtnSt}>
          <HeartIcon filled={isFav} size={18} />
        </button>
        {onPlaylist && (
          <button onClick={e => { e.stopPropagation(); onPlaylist(); }} style={iconBtnSt}>
            <PlusIcon size={18} color={colors.mutedForeground} />
          </button>
        )}
        <button onClick={e => { e.stopPropagation(); onDownload(); }} disabled={isDownloading} style={iconBtnSt}>
          <DownloadIcon loading={isDownloading} size={18} />
        </button>
        {onRemove && (
          <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ ...iconBtnSt, opacity: 0.5 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f15e6c" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}

/* ===================== ICON COMPONENTS ===================== */
function HeartIcon({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return filled
    ? <svg width={size} height={size} viewBox="0 0 24 24" fill="#1DB954"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    : <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#b3b3b3" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
}

function PlusIcon({ size = 18, color = "#b3b3b3" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>;
}

function DownloadIcon({ loading, size = 18 }: { loading: boolean; size?: number }) {
  return loading
    ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1DB954" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" strokeDasharray="40 20"/></svg>
    : <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#b3b3b3" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}

const iconBtnSt: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: "6px", display: "flex", alignItems: "center", justifyContent: "center",
};

function HomeIcon({ active, color }: { active: boolean; color: string }) {
  return active
    ? <svg width="24" height="24" viewBox="0 0 24 24" fill={color}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
    : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b3b3b3" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>;
}
function SearchIcon({ active, color }: { active: boolean; color: string }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? color : "#b3b3b3"} strokeWidth={active ? 2.5 : 2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function LibraryIcon({ active, color }: { active: boolean; color: string }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? color : "#b3b3b3"} strokeWidth={active ? 2.5 : 2}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
}
function DeviceIcon({ active, color }: { active: boolean; color: string }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? color : "#b3b3b3"} strokeWidth={active ? 2.5 : 2}><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>;
}
