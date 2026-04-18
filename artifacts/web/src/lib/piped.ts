const BASE_URL = "https://c68167c1-9d98-42f1-9e56-fa1768e61a90-00-tvhwnarqg09z.worf.replit.dev";

export type PipedTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

export async function searchTracks(query: string): Promise<PipedTrack[]> {
  const res = await fetch(`${BASE_URL}/api/search?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`البحث فشل: ${res.status}`);
  const json = await res.json();
  const data: Array<{ videoId: string; title: string; thumbnail?: string; author?: string; duration?: string }> =
    Array.isArray(json) ? json : (json.results ?? json.tracks ?? []);
  return data.map((item) => ({
    videoId: item.videoId,
    title: item.title ?? "بدون عنوان",
    artist: item.author ?? "فنان غير معروف",
    duration: item.duration ?? "0:00",
    thumbnail: item.thumbnail ?? null,
    streamUrl: `${BASE_URL}/api/proxy?id=${item.videoId}`,
  }));
}

export function resolveStreamUrl(videoId: string): Promise<string> {
  return Promise.resolve(`${BASE_URL}/api/proxy?id=${videoId}`);
}
