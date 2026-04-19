export const API_BASE = "https://youtube-stream-api--seifmusic7.replit.app";

export type PipedTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

export async function searchTracks(query: string): Promise<PipedTrack[]> {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`البحث فشل: ${res.status}`);
  const json = await res.json();
  const items: any[] = Array.isArray(json) ? json : (json.results ?? json.tracks ?? []);
  return items.map((item: any) => ({
    videoId: item.videoId,
    title: item.title ?? "بدون عنوان",
    artist: item.author ?? item.artist ?? "فنان غير معروف",
    duration: item.duration ?? "0:00",
    thumbnail: item.thumbnail ?? null,
    streamUrl: `${API_BASE}/api/proxy?id=${item.videoId}`,
  }));
}

export function resolveStreamUrl(videoId: string): string {
  return `${API_BASE}/api/proxy?id=${videoId}`;
}
