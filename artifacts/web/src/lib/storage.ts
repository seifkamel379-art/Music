export type StoredTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

function get<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    return val ? (JSON.parse(val) as T) : fallback;
  } catch {
    return fallback;
  }
}

function set<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

export const storage = {
  getSession: (): string | null => localStorage.getItem("session_name"),
  setSession: (name: string) => localStorage.setItem("session_name", name),
  clearSession: () => localStorage.removeItem("session_name"),

  getPlaylist: (): StoredTrack[] => get("playlist", []),
  setPlaylist: (tracks: StoredTrack[]) => set("playlist", tracks),

  getFavorites: (): StoredTrack[] => get("favorites", []),
  setFavorites: (tracks: StoredTrack[]) => set("favorites", tracks),

  getHistory: (): string[] => get("search_history", []),
  setHistory: (items: string[]) => set("search_history", items),
};
