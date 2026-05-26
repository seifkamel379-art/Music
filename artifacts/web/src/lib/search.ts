/* YouTube Music search using multiple public Piped API instances — no server needed */

export type Track = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
};

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://piped-api.garudalinux.org",
  "https://api.piped.projectsegfau.lt",
  "https://piped.lunar.icu/api",
];

function fmtDuration(secs: number): string {
  const n = Math.floor(secs ?? 0);
  if (!n) return "0:00";
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function upgradeThumbnail(url: string | undefined, videoId: string): string {
  if (!url) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  if (url.includes("i.ytimg.com")) return url.replace(/\/[a-z]+default\.jpg/, "/hqdefault.jpg");
  return url;
}

async function searchOnInstance(api: string, query: string): Promise<Track[]> {
  const res = await fetch(
    `${api}/search?q=${encodeURIComponent(query)}&filter=music_songs`,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) throw new Error(`${api} → ${res.status}`);
  const data = await res.json() as { items?: any[] };
  const items: Track[] = [];
  for (const item of data.items ?? []) {
    const id: string = item.url?.replace("/watch?v=", "") ?? item.id ?? "";
    if (!id) continue;
    const title: string = item.title ?? "بدون عنوان";
    const artist: string = item.uploaderName ?? item.uploader ?? "فنان غير معروف";
    const duration: string = item.duration ? fmtDuration(item.duration) : "0:00";
    const thumbnail = upgradeThumbnail(item.thumbnail, id);
    items.push({ videoId: id, title, artist, duration, thumbnail });
    if (items.length >= 20) break;
  }
  return items;
}

async function searchFallbackYT(query: string): Promise<Track[]> {
  for (const api of PIPED_INSTANCES) {
    try {
      const res = await fetch(
        `${api}/search?q=${encodeURIComponent(query)}&filter=videos`,
        { signal: AbortSignal.timeout(12000) },
      );
      if (!res.ok) continue;
      const data = await res.json() as { items?: any[] };
      const items: Track[] = [];
      for (const item of data.items ?? []) {
        const id: string = item.url?.replace("/watch?v=", "") ?? "";
        if (!id) continue;
        const title = item.title ?? "بدون عنوان";
        const artist = item.uploaderName ?? "فنان غير معروف";
        const duration = item.duration ? fmtDuration(item.duration) : "0:00";
        const thumbnail = upgradeThumbnail(item.thumbnail, id);
        items.push({ videoId: id, title, artist, duration, thumbnail });
        if (items.length >= 20) break;
      }
      if (items.length > 0) return items;
    } catch { continue; }
  }
  return [];
}

const cache = new Map<string, { data: Track[]; time: number }>();
const CACHE_TTL = 8 * 60 * 1000;

export async function searchTracks(query: string): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];

  const cached = cache.get(q);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;

  for (const api of PIPED_INSTANCES) {
    try {
      const results = await searchOnInstance(api, q);
      if (results.length > 0) {
        cache.set(q, { data: results, time: Date.now() });
        return results;
      }
    } catch { continue; }
  }

  const fallback = await searchFallbackYT(q);
  if (fallback.length > 0) {
    cache.set(q, { data: fallback, time: Date.now() });
  }
  return fallback;
}
