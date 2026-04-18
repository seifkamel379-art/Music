const EXTERNAL_API = "https://c68167c1-9d98-42f1-9e56-fa1768e61a90-00-tvhwnarqg09z.worf.replit.dev";

export type PipedTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

export async function searchTracks(query: string): Promise<PipedTrack[]> {
  const res = await fetch(`${EXTERNAL_API}/api/search?q=${encodeURIComponent(query)}`, {
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
    streamUrl: `${EXTERNAL_API}/api/proxy?id=${item.videoId}`,
  }));
}

export function resolveStreamUrl(videoId: string): Promise<string> {
  return Promise.resolve(`${EXTERNAL_API}/api/proxy?id=${videoId}`);
}
