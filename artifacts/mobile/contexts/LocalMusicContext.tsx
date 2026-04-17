import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type LocalTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

type LocalMusicContextValue = {
  playlist: LocalTrack[];
  favorites: LocalTrack[];
  searchHistory: string[];
  addToPlaylist: (track: LocalTrack) => void;
  removeFromPlaylist: (videoId: string) => void;
  toggleFavorite: (track: LocalTrack) => void;
  isFavorite: (videoId: string) => boolean;
  addSearchHistory: (term: string) => void;
  clearSearchHistory: () => void;
  currentTrack: LocalTrack | null;
  isPlaying: boolean;
  setCurrentTrack: (track: LocalTrack | null) => void;
  setIsPlaying: (v: boolean) => void;
};

const Ctx = createContext<LocalMusicContextValue | null>(null);

const KEYS = {
  playlist: "seif-local-playlist",
  favorites: "seif-local-favorites",
  history: "seif-search-history",
};

async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function save(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

export function LocalMusicProvider({ children }: { children: React.ReactNode }) {
  const [playlist, setPlaylist] = useState<LocalTrack[]>([]);
  const [favorites, setFavorites] = useState<LocalTrack[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [currentTrack, setCurrentTrack] = useState<LocalTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    Promise.all([
      load<LocalTrack[]>(KEYS.playlist, []),
      load<LocalTrack[]>(KEYS.favorites, []),
      load<string[]>(KEYS.history, []),
    ]).then(([pl, fav, hist]) => {
      setPlaylist(pl);
      setFavorites(fav);
      setSearchHistory(hist);
      ready.current = true;
    });
  }, []);

  const addToPlaylist = useCallback((track: LocalTrack) => {
    setPlaylist((prev) => {
      const exists = prev.some((t) => t.videoId === track.videoId);
      const next = exists ? prev : [...prev, track];
      save(KEYS.playlist, next);
      return next;
    });
  }, []);

  const removeFromPlaylist = useCallback((videoId: string) => {
    setPlaylist((prev) => {
      const next = prev.filter((t) => t.videoId !== videoId);
      save(KEYS.playlist, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((track: LocalTrack) => {
    setFavorites((prev) => {
      const exists = prev.some((t) => t.videoId === track.videoId);
      const next = exists ? prev.filter((t) => t.videoId !== track.videoId) : [track, ...prev];
      save(KEYS.favorites, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (videoId: string) => favorites.some((t) => t.videoId === videoId),
    [favorites],
  );

  const addSearchHistory = useCallback((term: string) => {
    if (!term.trim() || term.trim().length < 2) return;
    setSearchHistory((prev) => {
      const next = [term, ...prev.filter((h) => h !== term)].slice(0, 10);
      save(KEYS.history, next);
      return next;
    });
  }, []);

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
    AsyncStorage.removeItem(KEYS.history).catch(() => undefined);
  }, []);

  const value = useMemo<LocalMusicContextValue>(
    () => ({
      playlist,
      favorites,
      searchHistory,
      addToPlaylist,
      removeFromPlaylist,
      toggleFavorite,
      isFavorite,
      addSearchHistory,
      clearSearchHistory,
      currentTrack,
      isPlaying,
      setCurrentTrack,
      setIsPlaying,
    }),
    [playlist, favorites, searchHistory, addToPlaylist, removeFromPlaylist, toggleFavorite, isFavorite, addSearchHistory, clearSearchHistory, currentTrack, isPlaying],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocalMusic() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLocalMusic must be inside LocalMusicProvider");
  return v;
}
