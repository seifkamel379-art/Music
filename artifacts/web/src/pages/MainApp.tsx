import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { searchTracks as pipedSearch } from "@/lib/piped";
import { storage, type Track } from "@/lib/storage";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useTheme } from "@/contexts/ThemeContext";
import TrackRow from "@/components/TrackRow";
import MiniPlayer from "@/components/MiniPlayer";
import PlayerModal from "@/components/PlayerModal";

type Section = "home" | "search" | "playlist" | "favorites" | "device";

type DeviceTrack = { id: string; title: string; artist: string; duration: string; url: string };

const QUICK_SEARCHES = ["اغاني مصرية", "عمرو دياب", "ويجز", "تامر حسني", "أم كلثوم", "راب مصري"];

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function safeTitle(name: string) {
  return name.replace(/\.[^/.]+$/, "").slice(0, 60) || "أغنية";
}

const EXTERNAL_API = "https://youtube-stream-api--seifmusic7.replit.app";

async function downloadTrack(track: Track, setDownloading: React.Dispatch<React.SetStateAction<Set<string>>>) {
  setDownloading(prev => new Set([...prev, track.videoId]));
  try {
    const downloadUrl = `${EXTERNAL_API}/api/proxy?id=${encodeURIComponent(track.videoId)}`;
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${track.title}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  } catch {
    window.open(`${EXTERNAL_API}/api/proxy?id=${encodeURIComponent(track.videoId)}`, "_blank", "noopener,noreferrer");
  } finally {
    setDownloading(prev => { const next = new Set(prev); next.delete(track.videoId); return next; });
  }
}

function toTrack(t: { videoId: string; title: string; artist: string; duration: string; thumbnail?: string | null; streamUrl: string }): Track {
  return { videoId: t.videoId, title: t.title, artist: t.artist, duration: t.duration, thumbnail: t.thumbnail ?? null, streamUrl: t.streamUrl };
}

interface Props { userName: string; onLogout: () => void; }

export default function MainApp({ userName, onLogout }: Props) {
  const { colors, themeMode, toggleTheme } = useTheme();
  const [section, setSection] = useState<Section>("home");
  const [query, setQuery] = useState("اغاني مصرية");
  const [playlist, setPlaylist] = useState<Track[]>(() => storage.getPlaylist());
  const [favorites, setFavorites] = useState<Track[]>(() => storage.getFavorites());
  const [history, setHistory] = useState<string[]>(() => storage.getHistory());
  const [showPlayer, setShowPlayer] = useState(false);
  const [deviceTracks, setDeviceTracks] = useState<DeviceTrack[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentTrack, playTrack } = useAudioPlayer();

  useEffect(() => {
    if (query.trim().length <= 1) { setSearchResults([]); return; }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      pipedSearch(query.trim())
        .then(tracks => setSearchResults(tracks as Track[]))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 600);
    return () => clearTimeout(timer);
  }, [query]);

  const searchTracks: Track[] = searchResults;
  const featured = useMemo(() => (playlist.length > 0 ? playlist.slice(0, 6) : searchTracks.slice(0, 6)), [playlist, searchTracks]);

  const addHistory = useCallback((q: string) => {
    setHistory(prev => { const next = [q, ...prev.filter(x => x !== q)].slice(0, 10); storage.setHistory(next); return next; });
  }, []);

  const toggleFavorite = useCallback((track: Track) => {
    setFavorites(prev => {
      const next = prev.some(t => t.videoId === track.videoId) ? prev.filter(t => t.videoId !== track.videoId) : [track, ...prev];
      storage.setFavorites(next); return next;
    });
  }, []);

  const addToPlaylist = useCallback((track: Track) => {
    setPlaylist(prev => { if (prev.some(t => t.videoId === track.videoId)) return prev; const next = [...prev, track]; storage.setPlaylist(next); return next; });
  }, []);

  const removeFromPlaylist = useCallback((id: string) => {
    setPlaylist(prev => { const next = prev.filter(t => t.videoId !== id); storage.setPlaylist(next); return next; });
  }, []);

  const isFav = useCallback((id: string) => favorites.some(t => t.videoId === id), [favorites]);

  const listData = useMemo<Track[]>(() => {
    if (section === "favorites") return favorites;
    if (section === "playlist") return playlist;
    return searchTracks;
  }, [section, favorites, playlist, searchTracks]);

  /* ===== جهازي: قراءة ملفات الصوت من الجهاز ===== */
  function handleDeviceSection() {
    setSection("device");
    if (deviceTracks.length > 0) return;
    /* Try File System Access API first, fallback to <input file> */
    loadDeviceFiles();
  }

  async function loadDeviceFiles() {
    setDeviceLoading(true);
    setDeviceError(null);
    try {
      /* Modern File System Access API */
      if ("showOpenFilePicker" in window) {
        const files: File[] = [];
        try {
          const handles = await (window as any).showOpenFilePicker({
            multiple: true,
            types: [{ description: "ملفات صوتية", accept: { "audio/*": [".mp3", ".m4a", ".flac", ".wav", ".ogg", ".aac", ".opus", ".wma"] } }],
          });
          for (const h of handles) files.push(await h.getFile());
          setDeviceTracks(files.map((f, i) => ({
            id: `device-${i}-${f.name}`, title: safeTitle(f.name),
            artist: "جهازك", duration: "",
            url: URL.createObjectURL(f),
          })));
        } catch (err: any) {
          if (err?.name !== "AbortError") throw err;
        }
      } else {
        /* Fallback: trigger hidden file input */
        fileInputRef.current?.click();
      }
    } catch {
      setDeviceError("تعذّر قراءة ملفات الصوت. جرّب تاني أو اختار الملفات يدوياً.");
    }
    setDeviceLoading(false);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setDeviceTracks(files.map((f, i) => ({
      id: `device-${i}-${f.name}`, title: safeTitle(f.name),
      artist: "جهازك", duration: "",
      url: URL.createObjectURL(f),
    })));
    /* Reset input so same files can be re-selected */
    e.target.value = "";
  }

  function playDeviceTrack(track: DeviceTrack) {
    const t: Track = { videoId: track.id, title: track.title, artist: track.artist, duration: track.duration, thumbnail: null, streamUrl: track.url };
    const allQ = deviceTracks.map(d => ({ videoId: d.id, title: d.title, artist: d.artist, duration: d.duration, thumbnail: null, streamUrl: d.url }));
    playTrack(t, allQ);
  }

  const hasPlayer = !!currentTrack;
  const C = colors;

  /* Shared styles */
  const sectionTitle = { fontSize: 20, fontWeight: 700, color: C.foreground, marginInline: 18, marginTop: 20, marginBottom: 10, direction: "rtl" } as const;

  return (
    <div style={{ minHeight: "100dvh", background: C.background, overflowY: "auto", paddingBottom: hasPlayer ? 158 : 76 }}>

      {/* Hidden file input for fallback */}
      <input ref={fileInputRef} type="file" accept="audio/*" multiple style={{ display: "none" }} onChange={handleFileInput} />

      {/* ===== HEADER ===== */}
      <div style={{ padding: "12px 18px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", direction: "rtl" }}>
        <div>
          <div style={{ color: C.mutedForeground, fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase" }}>PRIVATE STREAM</div>
          <div style={{ color: C.foreground, fontSize: 34, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.1 }}>music&sk</div>
          <div style={{ color: C.mutedForeground, fontSize: 14, fontWeight: 500, marginTop: 4 }}>أهلاً {userName}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <CircleBtn onClick={toggleTheme} title={themeMode === "dark" ? "وضع النهار" : "وضع الليل"} bg={C.card}>
            {themeMode === "dark"
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </CircleBtn>
          <CircleBtn onClick={onLogout} title="خروج" bg={C.card}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </CircleBtn>
        </div>
      </div>

      {/* ===== HERO ===== */}
      <div style={{ marginInline: 18, borderRadius: 22, padding: 18, minHeight: 140, background: C.espresso, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", direction: "rtl" }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.gold, fontSize: 13, fontWeight: 700 }}>موسيقاك الخاصة</div>
          <div style={{ color: "#fff", fontSize: 27, fontWeight: 700, marginTop: 6, letterSpacing: -0.6 }}>{playlist.length} أغنية في مكتبتك</div>
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: "19px", marginTop: 8, fontWeight: 500 }}>بحث سريع · تشغيل فوري · تحميل كامل</div>
        </div>
        <div style={{ width: 128, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          <div style={{ width: 92, height: 92, borderRadius: 46, border: `2px solid ${C.gold}`, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)" }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          {[72, 48, 32].map((h, i) => (
            <div key={i} className="wave-bar" style={{ width: 7, height: h, borderRadius: 999, background: C.gold, opacity: 0.85, animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
      </div>

      {/* ===== SEARCH ===== */}
      <div style={{ marginInline: 18, marginTop: 16, height: 54, borderRadius: 22, border: `1px solid ${C.border}`, paddingInline: 16, display: "flex", alignItems: "center", gap: 10, background: C.card, direction: "rtl" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text" value={query}
          onChange={e => { setQuery(e.target.value); if (e.target.value.trim().length > 1) setSection("search"); }}
          onKeyDown={e => { if (e.key === "Enter" && query.trim().length > 1) { addHistory(query.trim()); setSection("search"); } }}
          placeholder="ابحث عن أي أغنية"
          style={{ flex: 1, height: 52, fontSize: 16, fontWeight: 600, background: "transparent", border: "none", outline: "none", color: C.foreground, fontFamily: "inherit", textAlign: "right", direction: "rtl" }}
        />
        {query && (
          <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: C.mutedForeground, display: "flex" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {/* ===== HISTORY CHIPS ===== */}
      {history.length > 0 && section !== "device" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingInline: 20, paddingTop: 10, paddingBottom: 2, direction: "rtl" }}>
            <span style={{ color: C.mutedForeground, fontWeight: 700, fontSize: 12 }}>بحث سابق</span>
            <button onClick={() => { setHistory([]); storage.setHistory([]); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.destructive, fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}>مسح</button>
          </div>
          <div style={{ display: "flex", overflowX: "auto", gap: 8, paddingInline: 18, paddingBlock: 8, scrollbarWidth: "none" }}>
            {history.map(h => (
              <Chip key={h} onClick={() => { setQuery(h); setSection("search"); }} active={false} C={C}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.mutedForeground} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {h}
              </Chip>
            ))}
          </div>
        </>
      )}

      {/* ===== QUICK SEARCHES ===== */}
      <div style={{ display: "flex", overflowX: "auto", gap: 8, paddingInline: 18, paddingBlock: 8, scrollbarWidth: "none" }}>
        {QUICK_SEARCHES.map(q2 => (
          <Chip key={q2} onClick={() => { setQuery(q2); setSection("search"); addHistory(q2); }} active={query === q2} C={C}>{q2}</Chip>
        ))}
      </div>

      {/* ===== FEATURED (home only) ===== */}
      {section === "home" && featured.length > 0 && (
        <>
          <div style={sectionTitle}>مختارات</div>
          <div style={{ display: "flex", overflowX: "auto", gap: 12, paddingInline: 18, paddingBottom: 8, scrollbarWidth: "none" }}>
            {featured.map((t, i) => <FeaturedCard key={t.videoId} track={t} index={i} onPlay={() => playTrack(t, featured)} C={C} />)}
          </div>
          <div style={sectionTitle}>نتائج البحث</div>
        </>
      )}

      {/* ===== SECTION HEADER (non-home, non-device) ===== */}
      {section !== "home" && section !== "device" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingInlineEnd: 18, direction: "rtl" }}>
          <div style={sectionTitle}>
            {section === "playlist" ? `مكتبتك (${playlist.length})` : section === "favorites" ? `المفضلة (${favorites.length})` : "نتائج البحث"}
          </div>
          {section === "playlist" && playlist.length > 0 && (
            <button onClick={() => playlist.forEach(t => downloadTrack(t, setDownloadingIds))} style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "9px 13px", background: C.primary, border: "none", cursor: "pointer", color: C.primaryForeground, fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              تحميل الكل
            </button>
          )}
        </div>
      )}

      {/* ===== جهازي SECTION ===== */}
      {section === "device" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingInlineEnd: 18, direction: "rtl" }}>
            <div style={sectionTitle}>موسيقى جهازك ({deviceTracks.length})</div>
            <button onClick={loadDeviceFiles} style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "9px 13px", background: C.card, border: `1px solid ${C.border}`, cursor: "pointer", color: C.primary, fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              اختيار ملفات
            </button>
          </div>
          {deviceLoading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
                {[0,1,2,3,4].map(i => <div key={i} className="wave-bar" style={{ width: 5, height: 24, background: C.primary, borderRadius: 999, animationDelay: `${i*0.1}s` }} />)}
              </div>
            </div>
          )}
          {deviceError && (
            <div style={{ margin: "10px 18px", padding: "12px 16px", borderRadius: 14, background: `${C.destructive}22`, border: `1px solid ${C.destructive}55`, color: C.destructive, fontSize: 14, direction: "rtl" }}>
              {deviceError}
            </div>
          )}
          {!deviceLoading && deviceTracks.length === 0 && !deviceError && (
            <div style={{ margin: 18, borderRadius: 22, border: `1px solid ${C.border}`, padding: 24, background: C.card, textAlign: "center", direction: "rtl" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5" style={{ margin: "0 auto 10px" }}><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.foreground, marginBottom: 6 }}>موسيقى جهازك</div>
              <div style={{ fontSize: 14, color: C.mutedForeground, lineHeight: "20px" }}>اضغط "اختيار ملفات" واختار ملفات الصوت من جهازك. الملفات مش بتتحمل على الإنترنت، بتشتغل محلياً بس.</div>
              <button onClick={loadDeviceFiles} style={{ marginTop: 16, padding: "12px 28px", borderRadius: 20, background: C.primary, border: "none", cursor: "pointer", color: C.primaryForeground, fontSize: 16, fontWeight: 700, fontFamily: "inherit" }}>
                اختار ملفات الموسيقى
              </button>
            </div>
          )}
          {deviceTracks.map((dt, i) => (
            <div key={dt.id} onClick={() => playDeviceTrack(dt)} style={{
              display: "flex", alignItems: "center", gap: 10,
              margin: "0 18px 8px", border: `1px solid ${currentTrack?.videoId === dt.id ? C.primary : C.border}`,
              borderRadius: 20, padding: 10, background: currentTrack?.videoId === dt.id ? C.secondary : C.card,
              cursor: "pointer", direction: "rtl",
            }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: C.muted, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.foreground, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dt.title}</div>
                <div style={{ color: C.mutedForeground, fontSize: 12, fontWeight: 500, marginTop: 3 }}>{dt.artist}</div>
              </div>
              {currentTrack?.videoId === dt.id ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill={C.primary}><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="2" height="6" rx="1" fill={C.primaryForeground}/><rect x="13" y="9" width="2" height="6" rx="1" fill={C.primaryForeground}/></svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill={C.mutedForeground}><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill={C.primaryForeground}/></svg>
              )}
            </div>
          ))}
        </>
      )}

      {/* ===== LOADING ===== */}
      {searchLoading && (section === "search" || section === "home") && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 5, padding: "20px 0" }}>
          {[0,1,2,3,4].map(i => <div key={i} className="wave-bar" style={{ width: 5, height: 24, background: C.primary, borderRadius: 999, animationDelay: `${i*0.1}s` }} />)}
        </div>
      )}

      {/* ===== EMPTY ===== */}
      {section !== "device" && listData.length === 0 && !searchLoading && (
        <div style={{ margin: 18, borderRadius: 22, border: `1px solid ${C.border}`, padding: 24, background: C.card, display: "flex", flexDirection: "column", alignItems: "center", direction: "rtl" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <div style={{ marginTop: 10, fontSize: 17, fontWeight: 700, color: C.foreground }}>
            {section === "favorites" ? "لسه مفيش مفضلة" : section === "playlist" ? "القائمة فاضية" : "ابدأ البحث"}
          </div>
          <div style={{ marginTop: 6, textAlign: "center", lineHeight: "20px", fontWeight: 500, color: C.mutedForeground, fontSize: 14 }}>
            {section === "playlist" || section === "favorites" ? "دور على الأغاني وضيفها للقائمة أو المفضلة" : "اكتب اسم الأغنية أو الفنان"}
          </div>
        </div>
      )}

      {/* ===== TRACK LIST ===== */}
      {section !== "device" && listData.map((track, i) => (
        <TrackRow
          key={track.videoId} track={track} index={i}
          isCurrent={currentTrack?.videoId === track.videoId}
          isPlaying={currentTrack?.videoId === track.videoId}
          isFavorite={isFav(track.videoId)}
          isDownloading={downloadingIds.has(track.videoId)}
          onPlay={() => playTrack(track, listData)}
          onFavorite={() => toggleFavorite(track)}
          onPlaylist={() => addToPlaylist(track)}
          onDownload={() => downloadTrack(track, setDownloadingIds)}
          onRemove={section === "playlist" ? () => removeFromPlaylist(track.videoId) : undefined}
          C={C}
        />
      ))}

      {/* ===== MINI PLAYER ===== */}
      {hasPlayer && <MiniPlayer onOpenPlayer={() => setShowPlayer(true)} C={C} />}

      {/* ===== BOTTOM NAV ===== */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: 76, background: C.espresso, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-around", paddingTop: 8, paddingBottom: 10, zIndex: 20 }}>
        {([
          { s: "home", label: "الرئيسية", icon: <HomeIcon /> },
          { s: "search", label: "بحث", icon: <SearchIcon /> },
          { s: "playlist", label: "مكتبتك", icon: <ListIcon /> },
          { s: "favorites", label: "المفضلة", icon: <HeartIcon /> },
          { s: "device", label: "جهازي", icon: <PhoneIcon /> },
        ] as { s: Section; label: string; icon: React.ReactNode }[]).map(item => {
          const active = section === item.s;
          return (
            <button key={item.s} onClick={() => item.s === "device" ? handleDeviceSection() : setSection(item.s as Section)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, background: "none", border: "none", cursor: "pointer",
              color: active ? C.primary : C.mutedForeground,
            }}>
              <span style={{ color: active ? C.primary : C.mutedForeground }}>{item.icon}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: "inherit" }}>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ===== PLAYER MODAL ===== */}
      {showPlayer && <PlayerModal onClose={() => setShowPlayer(false)} C={C} />}
    </div>
  );
}

/* ===== SUB COMPONENTS ===== */
function CircleBtn({ onClick, title, bg, children }: { onClick: () => void; title?: string; bg: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{ width: 46, height: 46, borderRadius: 23, background: bg, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}

function Chip({ onClick, active, C, children }: { onClick: () => void; active: boolean; C: any; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      borderRadius: 999, border: `1px solid ${C.border}`, padding: "9px 13px",
      display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
      background: active ? C.primary : C.card, cursor: "pointer",
      color: active ? C.primaryForeground : C.foreground, fontFamily: "inherit", fontSize: 13, fontWeight: 700,
    }}>{children}</button>
  );
}

function FeaturedCard({ track, index, onPlay, C }: { track: Track; index: number; onPlay: () => void; C: any }) {
  const [imgErr, setImgErr] = useState(false);
  const COVERS = ["/cover-one.png", "/cover-two.png", "/cover-three.png"];
  return (
    <button onClick={onPlay} style={{ width: 140, borderRadius: 22, padding: 10, background: C.card, border: "none", cursor: "pointer", flexShrink: 0, textAlign: "right", direction: "rtl" }}>
      <div style={{ width: "100%", height: 120, borderRadius: 16, marginBottom: 8, overflow: "hidden" }}>
        {track.thumbnail && !imgErr
          ? <img src={track.thumbnail} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <img src={COVERS[index % 3]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        }
      </div>
      <div style={{ fontSize: 13, lineHeight: "17px", fontWeight: 700, color: C.foreground, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{track.title}</div>
      <div style={{ fontSize: 11, fontWeight: 500, marginTop: 3, color: C.mutedForeground, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.artist}</div>
    </button>
  );
}

/* Icons */
function HomeIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>; }
function SearchIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function ListIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>; }
function HeartIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>; }
function PhoneIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>; }

