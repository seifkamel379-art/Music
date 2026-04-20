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
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`البحث فشل: ${res.status}`);
  const items: any[] = await res.json();
  return items.map((item: any) => ({
    videoId: item.videoId,
    title: item.title ?? "بدون عنوان",
    artist: item.artist ?? item.author ?? "فنان غير معروف",
    duration: item.duration ?? "0:00",
    thumbnail: item.thumbnail ?? null,
    streamUrl: `yt:${item.videoId}`,
  }));
}

export async function resolveStreamUrl(videoId: string): Promise<string> {
  const res = await fetch(`/api/music/stream-url?id=${encodeURIComponent(videoId)}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`فشل جلب رابط الصوت: ${res.status}`);
  const data = await res.json();
  if (!data?.url) throw new Error("لا يوجد رابط صوت");
  return data.url;
}
