/* Search via Piped API directly from the browser — no server round-trip needed */

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.projectsegfau.lt",
  "https://piped-api.garudalinux.org",
  "https://watchapi.whatever.social",
];

export type PipedTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

async function pipedFetch(path: string, timeoutMs = 12000): Promise<any> {
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.json();
    } catch { /* try next instance */ }
  }
  throw new Error("All Piped instances failed");
}

export async function searchTracks(query: string): Promise<PipedTrack[]> {
  try {
    const data = await pipedFetch(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    const items: any[] = Array.isArray(data.items) ? data.items : [];
    return items
      .filter(i => i.url && i.type !== "playlist" && i.type !== "channel")
      .slice(0, 15)
      .map(item => {
        const videoId = (item.url as string).replace("/watch?v=", "");
        return {
          videoId,
          title: item.title ?? "بدون عنوان",
          artist: item.uploaderName ?? item.uploader ?? "فنان غير معروف",
          duration: fmtDuration(item.duration ?? 0),
          thumbnail: item.thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          streamUrl: `/api/music/stream?id=${videoId}`,
        };
      });
  } catch {
    /* Fallback: let the server handle via yt-dlp */
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      const items: any[] = Array.isArray(json) ? json : (json.results ?? []);
      return items.map((item: any) => ({
        videoId: item.videoId,
        title: item.title ?? "بدون عنوان",
        artist: item.artist ?? "فنان غير معروف",
        duration: item.duration ?? "0:00",
        thumbnail: item.thumbnail ?? null,
        streamUrl: item.streamUrl ?? `/api/music/stream?id=${item.videoId}`,
      }));
    } catch { return []; }
  }
}

export function resolveStreamUrl(videoId: string): string {
  return `/api/music/stream?id=${videoId}`;
}
