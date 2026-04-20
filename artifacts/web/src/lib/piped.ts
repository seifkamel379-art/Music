export type PipedTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.projectsegfau.lt",
  "https://piped-api.garudalinux.org",
  "https://pipedapi.libre.deno.dev",
  "https://api.piped.yt",
];

async function fetchFromInstances(path: string): Promise<any> {
  let lastErr: unknown;
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(12000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("All Piped instances failed");
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function searchTracks(query: string): Promise<PipedTrack[]> {
  const data = await fetchFromInstances(
    `/search?q=${encodeURIComponent(query)}&filter=music_songs`
  );
  const items: any[] = data?.items ?? [];
  return items
    .filter((item: any) => item?.type === "stream" || item?.url?.startsWith("/watch"))
    .slice(0, 20)
    .map((item: any) => {
      const videoId = (item.url ?? "").replace("/watch?v=", "");
      return {
        videoId,
        title: item.title ?? "بدون عنوان",
        artist: item.uploaderName ?? item.uploader ?? "فنان غير معروف",
        duration: formatDuration(item.duration ?? 0),
        thumbnail: item.thumbnail ?? null,
        streamUrl: `yt:${videoId}`,
      };
    });
}

export async function resolveStreamUrl(videoId: string): Promise<string> {
  const data = await fetchFromInstances(`/streams/${videoId}`);
  const streams: any[] = data?.audioStreams ?? [];
  if (!streams.length) throw new Error("No audio streams found");
  const sorted = [...streams].sort(
    (a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0)
  );
  const best = sorted.find((s) => s.url) ?? sorted[0];
  return best.url;
}
