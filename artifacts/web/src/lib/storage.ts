export type Track = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

function get<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}
function set<T>(key: string, v: T) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

export const storage = {
  getSession: (): string | null => localStorage.getItem("sk_session"),
  setSession: (n: string) => localStorage.setItem("sk_session", n),
  clearSession: () => localStorage.removeItem("sk_session"),

  getPlaylist: (): Track[] => get("sk_playlist", []),
  setPlaylist: (t: Track[]) => set("sk_playlist", t),

  getFavorites: (): Track[] => get("sk_favorites", []),
  setFavorites: (t: Track[]) => set("sk_favorites", t),

  getHistory: (): string[] => get("sk_history", []),
  setHistory: (t: string[]) => set("sk_history", t),
};
