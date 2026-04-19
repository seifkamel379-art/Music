export type PipedTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

export async function searchTracks(query: string): Promise<PipedTrack[]> {
  const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(35000),
  });
  if (!res.ok) throw new Error(`البحث فشل: ${res.status}`);
  const json = await res.json();
  const items: any[] = Array.isArray(json) ? json : (json.results ?? json.tracks ?? []);
  return items.map((item: any) => ({
    videoId: item.videoId,
    title: item.title ?? "بدون عنوان",
    artist: item.artist ?? item.author ?? "فنان غير معروف",
    duration: item.duration ?? "0:00",
    thumbnail: item.thumbnail ?? null,
    streamUrl: item.streamUrl ?? `/api/music/stream?id=${item.videoId}`,
  }));
}

export function resolveStreamUrl(videoId: string): string {
  return `/api/music/stream?id=${videoId}`;
}
