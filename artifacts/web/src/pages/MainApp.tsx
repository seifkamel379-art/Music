import React, { useState, useCallback, useRef, useEffect } from "react";
import { searchTracks as apiSearch } from "@/lib/piped";
import { storage, type Track } from "@/lib/storage";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import MiniPlayer from "@/components/MiniPlayer";
import PlayerModal from "@/components/PlayerModal";

type Tab = "home" | "search" | "library" | "device";

type DeviceTrack = { id: string; title: string; artist: string; url: string };

const SECTIONS = [
  { label: "اتجاهات 2026", query: "اغاني 2026 جديدة trending" },
  { label: "Sabrina Carpenter", query: "Sabrina Carpenter 2025 2026" },
  { label: "Kendrick Lamar", query: "Kendrick Lamar 2025 2026" },
  { label: "Bad Bunny", query: "Bad Bunny 2025 2026" },
  { label: "Billie Eilish", query: "Billie Eilish 2025 2026" },
  { label: "Drake", query: "Drake 2025 2026" },
  { label: "اغاني عربية 2026", query: "اغاني عربية جديدة 2026" },
  { label: "ويجز", query: "ويجز 2025 2026" },
  { label: "The Weeknd", query: "The Weeknd 2025 2026" },
  { label: "Dua Lipa", query: "Dua Lipa 2025 2026" },
  { label: "راب مصري", query: "راب مصري جديد 2025 2026" },
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

const CATEGORY_COLORS = [
  "#1e3264","#7358ff","#e8115b","#eb1e32","#8d67ab",
  "#477d95","#608108","#e91429","#1e3264","#148a08",
  "#f59b23","#0d73ec","#503750","#27856a","#4b917d",
  "#148a08","#777777","#e8115b","#1e3264","#8d67ab",
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
  { label: "ميتال", color: "#333333", query: "metal music 2026" },
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

async function downloadMp3(videoId: string, title: string) {
  const url = `/api/music/download?id=${encodeURIComponent(videoId)}&title=${encodeURIComponent(title)}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.mp3`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

interface Props { userName: string; onLogout: () => void; }

export default function MainApp({ userName, onLogout }: Props) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadedSections = useRef<Set<number>>(new Set());
  const deviceBlobUrls = useRef<Map<string, string>>(new Map());
  const { currentTrack, playTrack, status } = useAudioPlayer();

  useEffect(() => {
    if (tab === "home") {
      [0, 1, 2].forEach(i => loadSection(i));
    }
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    const t = setTimeout(() => {
      apiSearch(query.trim())
        .then(r => setSearchResults(r as Track[]))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 500);
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

  function handleSectionVisible(idx: number) {
    loadSection(idx);
  }

  const toggleFavorite = useCallback((track: Track) => {
    setFavorites(prev => {
      const next = prev.some(t => t.videoId === track.videoId)
        ? prev.filter(t => t.videoId !== track.videoId)
        : [track, ...prev];
      storage.setFavorites(next); return next;
    });
  }, []);

  const addToPlaylist = useCallback((track: Track) => {
    setPlaylist(prev => {
      if (prev.some(t => t.videoId === track.videoId)) return prev;
      const next = [...prev, track]; storage.setPlaylist(next); return next;
    });
  }, []);

  const removeFromPlaylist = useCallback((id: string) => {
    setPlaylist(prev => { const next = prev.filter(t => t.videoId !== id); storage.setPlaylist(next); return next; });
  }, []);

  const isFav = useCallback((id: string) => favorites.some(t => t.videoId === id), [favorites]);

  function handleDownload(track: Track) {
    setDownloadingIds(p => new Set([...p, track.videoId]));
    downloadMp3(track.videoId, track.title).finally(() => {
      setTimeout(() => setDownloadingIds(p => { const n = new Set(p); n.delete(track.videoId); return n; }), 5000);
    });
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const newTracks: DeviceTrack[] = [];
    files.forEach((f, i) => {
      const id = `device-${Date.now()}-${i}-${f.name}`;
      const url = URL.createObjectURL(f);
      deviceBlobUrls.current.set(id, url);
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

  function searchCategory(q: string) {
    setTab("search");
    setQuery(q);
    const h = [q, ...history.filter(x => x !== q)].slice(0, 10);
    setHistory(h); storage.setHistory(h);
  }

  const hasPlayer = !!currentTrack;

  return (
    <div style={{ minHeight: "100dvh", background: "#000", display: "flex", flexDirection: "column", fontFamily: "'Circular Std', 'Inter', system-ui, sans-serif" }}>
      {showPlayer && <PlayerModal onClose={() => setShowPlayer(false)} />}

      <input ref={fileInputRef} type="file" accept="audio/*" multiple style={{ display: "none" }} onChange={handleFileInput} />

      {/* SCROLLABLE CONTENT */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: hasPlayer ? 148 : 72 }}>

        {/* ======= HOME ======= */}
        {tab === "home" && (
          <HomeTab
            userName={userName}
            playlist={playlist}
            favorites={favorites}
            sections={SECTIONS}
            sectionTracks={sectionTracks}
            sectionLoading={sectionLoading}
            currentTrack={currentTrack}
            isFav={isFav}
            downloadingIds={downloadingIds}
            onSectionVisible={handleSectionVisible}
            onPlaySection={(track: Track, allTracks: Track[]) => playTrack(track, allTracks)}
            onFavorite={toggleFavorite}
            onPlaylist={addToPlaylist}
            onDownload={handleDownload}
            onPlayPlaylist={() => { if (playlist.length) playTrack(playlist[0], playlist); }}
            onPlayFavorites={() => { if (favorites.length) playTrack(favorites[0], favorites); }}
            onLogout={onLogout}
          />
        )}

        {/* ======= SEARCH ======= */}
        {tab === "search" && (
          <SearchTab
            query={query}
            setQuery={setQuery}
            results={searchResults}
            loading={searchLoading}
            history={history}
            currentTrack={currentTrack}
            isFav={isFav}
            downloadingIds={downloadingIds}
            onPlay={(track: Track) => playTrack(track, searchResults)}
            onFavorite={toggleFavorite}
            onPlaylist={addToPlaylist}
            onDownload={handleDownload}
            onHistoryClick={(q: string) => { setQuery(q); }}
            onClearHistory={() => { setHistory([]); storage.setHistory([]); }}
            onCategoryClick={searchCategory}
          />
        )}

        {/* ======= LIBRARY ======= */}
        {tab === "library" && (
          <LibraryTab
            playlist={playlist}
            favorites={favorites}
            currentTrack={currentTrack}
            isFav={isFav}
            downloadingIds={downloadingIds}
            onPlay={(track: Track, list: Track[]) => playTrack(track, list)}
            onFavorite={toggleFavorite}
            onRemove={removeFromPlaylist}
            onDownload={handleDownload}
          />
        )}

        {/* ======= DEVICE ======= */}
        {tab === "device" && (
          <DeviceTab
            tracks={deviceTracks}
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
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 72, background: "#0a0a0a", borderTop: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-around", zIndex: 40, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {([
          { key: "home", icon: <HomeIcon active={tab === "home"} />, label: "الرئيسية" },
          { key: "search", icon: <SearchIcon active={tab === "search"} />, label: "استكشاف" },
          { key: "library", icon: <LibraryIcon active={tab === "library"} />, label: "مكتبتي" },
          { key: "device", icon: <DeviceIcon active={tab === "device"} />, label: "جهازي" },
        ] as const).map(({ key, icon, label }) => (
          <button key={key} onClick={() => { setTab(key as Tab); if (key === "search" && searchInputRef.current) setTimeout(() => searchInputRef.current?.focus(), 100); }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "6px 12px", opacity: tab === key ? 1 : 0.55, transition: "opacity 0.15s" }}>
            {icon}
            <span style={{ color: tab === key ? "#fff" : "#b3b3b3", fontSize: 10, fontWeight: 700 }}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ===================== HOME TAB ===================== */
function HomeTab({ userName, playlist, favorites, sections, sectionTracks, sectionLoading, currentTrack, isFav, downloadingIds, onSectionVisible, onPlaySection, onFavorite, onPlaylist, onDownload, onPlayPlaylist, onPlayFavorites, onLogout }: any) {
  const observerMap = useRef<Map<number, IntersectionObserver>>(new Map());

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "52px 16px 8px", direction: "rtl" }}>
        <div>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{greeting()}</div>
        </div>
        <button onClick={onLogout} style={{ width: 32, height: 32, borderRadius: "50%", background: "#535353", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>

      {/* Quick picks 2-col */}
      {(playlist.length > 0 || favorites.length > 0) && (
        <div style={{ padding: "8px 16px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, direction: "rtl" }}>
          {playlist.length > 0 && (
            <QuickCard label="مكتبتي" count={playlist.length} onClick={onPlayPlaylist} color="#1e3264" icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            } />
          )}
          {favorites.length > 0 && (
            <QuickCard label="المفضلة" count={favorites.length} onClick={onPlayFavorites} color="#8d67ab" icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            } />
          )}
        </div>
      )}

      {/* Section rows */}
      {sections.map((sec: typeof SECTIONS[0], idx: number) => (
        <SectionRow
          key={sec.query}
          title={sec.label}
          tracks={sectionTracks[idx] || []}
          loading={sectionLoading[idx]}
          currentTrack={currentTrack}
          isFav={isFav}
          downloadingIds={downloadingIds}
          onVisible={() => onSectionVisible(idx)}
          onPlay={(track: Track) => onPlaySection(track, sectionTracks[idx] || [])}
          onFavorite={onFavorite}
          onPlaylist={onPlaylist}
          onDownload={onDownload}
          accentColor={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}
        />
      ))}
    </div>
  );
}

function QuickCard({ label, count, onClick, color, icon }: any) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, background: "#1a1a1a", border: "none", borderRadius: 8, padding: 0, cursor: "pointer", overflow: "hidden", height: 56, direction: "rtl", width: "100%" }}>
      <div style={{ width: 56, height: 56, background: color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </div>
      <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, flex: 1, textAlign: "right", paddingRight: 4 }}>{label}</span>
    </button>
  );
}

function SectionRow({ title, tracks, loading, currentTrack, isFav, downloadingIds, onVisible, onPlay, onFavorite, onPlaylist, onDownload, accentColor }: any) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !visible) { setVisible(true); onVisible(); }
    }, { rootMargin: "200px" });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ marginTop: 28 }}>
      <div style={{ paddingInline: 16, marginBottom: 12, direction: "rtl" }}>
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>{title}</span>
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingInline: 16, scrollbarWidth: "none" }}>
        {loading && Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
        {!loading && tracks.map((track: Track, i: number) => (
          <TrackCard
            key={track.videoId}
            track={track}
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

function TrackCard({ track, isCurrent, isFav, isDownloading, onPlay, onFavorite, onPlaylist, onDownload, accentColor }: any) {
  const [imgErr, setImgErr] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ flexShrink: 0, width: 148, cursor: "pointer", position: "relative" }}>
      <div onClick={onPlay} style={{ width: 148, height: 148, borderRadius: 6, overflow: "hidden", marginBottom: 8, position: "relative", background: accentColor }}>
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
      <div onClick={onPlay}>
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: "18px" }}>{track.title}</div>
        <div style={{ color: "#b3b3b3", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.artist}</div>
      </div>
      {/* Three dot menu */}
      <div style={{ position: "relative" }}>
        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(p => !p); }} style={{ position: "absolute", top: -92, right: 0, background: "none", border: "none", cursor: "pointer", padding: 4, opacity: 0.7 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
        </button>
        {menuOpen && (
          <div style={{ position: "absolute", top: -80, right: 0, background: "#282828", borderRadius: 8, zIndex: 50, minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.6)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
            <MenuItem icon={<HeartIcon filled={isFav} />} label={isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"} onClick={() => { onFavorite(); setMenuOpen(false); }} />
            <MenuItem icon={<PlusIcon />} label="إضافة للمكتبة" onClick={() => { onPlaylist(); setMenuOpen(false); }} />
            <MenuItem icon={<DownloadIcon loading={isDownloading} />} label={isDownloading ? "جارٍ التحميل..." : "تحميل MP3"} onClick={() => { if (!isDownloading) onDownload(); setMenuOpen(false); }} />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick }: any) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", color: "#fff", fontSize: 14, fontWeight: 400, direction: "rtl", textAlign: "right" }}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div style={{ flexShrink: 0, width: 148 }}>
      <div style={{ width: 148, height: 148, borderRadius: 6, background: "#282828", marginBottom: 8 }} />
      <div style={{ height: 13, background: "#282828", borderRadius: 4, marginBottom: 6 }} />
      <div style={{ height: 11, background: "#1a1a1a", borderRadius: 4, width: "70%" }} />
    </div>
  );
}

/* ===================== SEARCH TAB ===================== */
function SearchTab({ query, setQuery, results, loading, history, currentTrack, isFav, downloadingIds, onPlay, onFavorite, onPlaylist, onDownload, onHistoryClick, onClearHistory, onCategoryClick }: any) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  return (
    <div style={{ paddingTop: 52 }}>
      <div style={{ padding: "0 16px 16px", direction: "rtl" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 16 }}>استكشاف</div>
        {/* Search bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 6, padding: "10px 14px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#121212" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={inputRef}
            type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ما الذي تريد الاستماع إليه؟"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, fontWeight: 500, color: "#121212", textAlign: "right", direction: "rtl", fontFamily: "inherit" }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#535353", display: "flex" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* History */}
      {!query && history.length > 0 && (
        <div style={{ padding: "0 16px", direction: "rtl" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>عمليات البحث الأخيرة</span>
            <button onClick={onClearHistory} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", fontSize: 14, fontWeight: 400 }}>مسح الكل</button>
          </div>
          {history.map((h: string) => (
            <div key={h} onClick={() => onHistoryClick(h)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer", borderBottom: "1px solid #1a1a1a", direction: "rtl" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b3b3b3" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{ color: "#fff", fontSize: 14, flex: 1 }}>{h}</span>
            </div>
          ))}
        </div>
      )}

      {/* Browse categories (no query) */}
      {!query && (
        <div style={{ padding: "16px 16px 0", direction: "rtl" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 12 }}>تصفح حسب الفئة</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {BROWSE_CATEGORIES.map(cat => (
              <button key={cat.label} onClick={() => onCategoryClick(cat.query)} style={{ height: 80, borderRadius: 8, background: cat.color, border: "none", cursor: "pointer", display: "flex", alignItems: "flex-end", padding: "10px 12px", overflow: "hidden", position: "relative", direction: "rtl" }}>
                <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, zIndex: 1, textAlign: "right" }}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search results */}
      {query && (
        <div style={{ padding: "0 16px", direction: "rtl" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid #282828", borderTopColor: "#1DB954", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}
          {!loading && results.length === 0 && query.length > 1 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#b3b3b3" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>لا توجد نتائج</div>
              <div style={{ fontSize: 14 }}>حاول بكلمات أخرى</div>
            </div>
          )}
          {results.map((track: Track) => (
            <SpotifyTrackRow
              key={track.videoId}
              track={track}
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
function LibraryTab({ playlist, favorites, currentTrack, isFav, downloadingIds, onPlay, onFavorite, onRemove, onDownload }: any) {
  const [activeList, setActiveList] = useState<"playlist" | "favorites">("playlist");
  const tracks = activeList === "playlist" ? playlist : favorites;

  return (
    <div style={{ paddingTop: 52, direction: "rtl" }}>
      <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontSize: 22, fontWeight: 700 }}>مكتبتي</span>
        <button onClick={() => { if (tracks.length) onPlay(tracks[0], tracks); }} style={{ width: 32, height: 32, borderRadius: "50%", background: "#1DB954", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#000"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
        {([["playlist", "المكتبة"], ["favorites", "المفضلة"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveList(key)} style={{ borderRadius: 999, padding: "6px 14px", background: activeList === key ? "#fff" : "#282828", border: "none", cursor: "pointer", color: activeList === key ? "#000" : "#fff", fontSize: 13, fontWeight: 700 }}>
            {label}
          </button>
        ))}
      </div>

      {tracks.length === 0 && (
        <div style={{ padding: "40px 16px", textAlign: "center", direction: "rtl" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#535353" strokeWidth="1.5" style={{ margin: "0 auto 16px" }}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>القائمة فارغة</div>
          <div style={{ color: "#b3b3b3", fontSize: 14 }}>ابحث عن أغاني وأضفها هنا</div>
        </div>
      )}

      {tracks.map((track: Track) => (
        <SpotifyTrackRow
          key={track.videoId}
          track={track}
          isCurrent={currentTrack?.videoId === track.videoId}
          isFav={isFav(track.videoId)}
          isDownloading={downloadingIds.has(track.videoId)}
          onPlay={() => onPlay(track, tracks)}
          onFavorite={() => onFavorite(track)}
          onPlaylist={() => {}}
          onDownload={() => onDownload(track)}
          onRemove={activeList === "playlist" ? () => onRemove(track.videoId) : undefined}
        />
      ))}
    </div>
  );
}

/* ===================== DEVICE TAB ===================== */
function DeviceTab({ tracks, currentTrack, onAdd, onPlay, onRemove }: any) {
  return (
    <div style={{ paddingTop: 52, direction: "rtl" }}>
      <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 700 }}>موسيقى جهازي</div>
          <div style={{ color: "#b3b3b3", fontSize: 13, marginTop: 4 }}>الملفات تشغيل محلي فقط - لا ترسل لأي مكان</div>
        </div>
        <button onClick={onAdd} style={{ width: 36, height: 36, borderRadius: "50%", background: "#1DB954", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      {tracks.length === 0 && (
        <div style={{ padding: "40px 16px", textAlign: "center" }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#535353" strokeWidth="1.2" style={{ margin: "0 auto 16px" }}><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 13h6M9 17h4M9 9h6"/></svg>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>لا توجد ملفات</div>
          <div style={{ color: "#b3b3b3", fontSize: 14, marginBottom: 24, lineHeight: "20px" }}>اضغط + لإضافة ملفات صوتية من جهازك. الملفات تشغيل محلي بالكامل ولا تُرفع لأي مكان.</div>
          <button onClick={onAdd} style={{ padding: "14px 32px", borderRadius: 999, background: "#1DB954", border: "none", cursor: "pointer", color: "#000", fontSize: 16, fontWeight: 700 }}>
            إضافة ملفات
          </button>
        </div>
      )}

      {tracks.map((dt: DeviceTrack) => (
        <div key={dt.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", cursor: "pointer", borderBottom: "1px solid #1a1a1a", direction: "rtl" }} onClick={() => onPlay(dt)}>
          <div style={{ width: 48, height: 48, borderRadius: 4, background: "#282828", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {currentTrack?.videoId === dt.id
              ? <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>{[0,1,2].map(i => <div key={i} className="wave-bar" style={{ width: 3, height: 12, background: "#1DB954", borderRadius: 2, animationDelay: `${i*0.15}s` }} />)}</div>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b3b3b3" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: currentTrack?.videoId === dt.id ? "#1DB954" : "#fff", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dt.title}</div>
            <div style={{ color: "#b3b3b3", fontSize: 12, marginTop: 2 }}>{dt.artist}</div>
          </div>
          <button onClick={e => { e.stopPropagation(); onRemove(dt.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, color: "#535353" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ===================== SPOTIFY TRACK ROW ===================== */
function SpotifyTrackRow({ track, isCurrent, isFav, isDownloading, onPlay, onFavorite, onPlaylist, onDownload, onRemove }: any) {
  const [imgErr, setImgErr] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", cursor: "pointer", position: "relative", direction: "rtl", borderRadius: 4 }}>
      <div onClick={onPlay} style={{ width: 48, height: 48, borderRadius: 4, overflow: "hidden", flexShrink: 0, background: "#282828", position: "relative" }}>
        {track.thumbnail && !imgErr
          ? <img src={track.thumbnail} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b3b3b3" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
        }
        {isCurrent && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>{[0,1,2].map(i => <div key={i} className="wave-bar" style={{ width: 3, height: 12, background: "#1DB954", borderRadius: 2, animationDelay: `${i*0.15}s` }} />)}</div>
          </div>
        )}
      </div>
      <div onClick={onPlay} style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: isCurrent ? "#1DB954" : "#fff", fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.title}</div>
        <div style={{ color: "#b3b3b3", fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.artist}{track.duration ? ` · ${track.duration}` : ""}</div>
      </div>
      <div onClick={e => { e.stopPropagation(); setMenuOpen(p => !p); }} style={{ padding: 8, color: "#b3b3b3", cursor: "pointer" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
      </div>
      {menuOpen && (
        <div style={{ position: "absolute", left: 0, top: "100%", background: "#282828", borderRadius: 8, zIndex: 50, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.6)", overflow: "hidden", direction: "rtl" }} onClick={e => e.stopPropagation()}>
          <MenuItem icon={<HeartIcon filled={isFav} />} label={isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"} onClick={() => { onFavorite(); setMenuOpen(false); }} />
          {onPlaylist && <MenuItem icon={<PlusIcon />} label="إضافة للمكتبة" onClick={() => { onPlaylist(); setMenuOpen(false); }} />}
          <MenuItem icon={<DownloadIcon loading={isDownloading} />} label={isDownloading ? "جارٍ التحميل..." : "تحميل MP3"} onClick={() => { if (!isDownloading) { onDownload(); } setMenuOpen(false); }} />
          {onRemove && <MenuItem icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f15e6c" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>} label="حذف" onClick={() => { onRemove(); setMenuOpen(false); }} />}
        </div>
      )}
    </div>
  );
}

/* ===================== ICON COMPONENTS ===================== */
function HeartIcon({ filled }: { filled: boolean }) {
  return filled
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DB954"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b3b3b3" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
}

function PlusIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b3b3b3" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>;
}

function DownloadIcon({ loading }: { loading: boolean }) {
  return loading
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1DB954" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" strokeDasharray="40 20"/></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b3b3b3" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}

function HomeIcon({ active }: { active: boolean }) {
  return active
    ? <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
    : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b3b3b3" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>;
}

function SearchIcon({ active }: { active: boolean }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#fff" : "#b3b3b3"} strokeWidth={active ? 2.5 : 2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}

function LibraryIcon({ active }: { active: boolean }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#fff" : "#b3b3b3"} strokeWidth={active ? 2.5 : 2}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
}

function DeviceIcon({ active }: { active: boolean }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#fff" : "#b3b3b3"} strokeWidth={active ? 2.5 : 2}><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>;
}

