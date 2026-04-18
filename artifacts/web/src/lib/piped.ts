const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://piped-api.garudalinux.org",
  "https://api.piped.yt",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.drgns.space",
];

const INVIDIOUS_INSTANCES = [
  "https://invidious.io.lol",
  "https://yt.artemislena.eu",
  "https://inv.nadeko.net",
  "https://invidious.privacydev.net",
  "https://invidious.nerdvpn.de",
];

async function tryFetch(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function pipedFetch(path: string): Promise<any> {
  for (const inst of PIPED_INSTANCES) {
    try { return await tryFetch(`${inst}${path}`); } catch {}
  }
  throw new Error("All Piped instances failed");
}

async function invidiousFetch(path: string): Promise<any> {
  for (const inst of INVIDIOUS_INSTANCES) {
    try { return await tryFetch(`${inst}${path}`); } catch {}
  }
  throw new Error("All Invidious instances failed");
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type PipedTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

export async function searchTracks(query: string): Promise<PipedTrack[]> {
  let items: any[] = [];

  try {
    const data = await pipedFetch(`/search?q=${encodeURIComponent(query)}&filter=all`);
    items = (data.items ?? []).filter((i: any) => i.type === "stream");
  } catch {
    try {
      const data = await invidiousFetch(`/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title,author,lengthSeconds,videoThumbnails`);
      items = (data ?? []).map((i: any) => ({
        url: `/watch?v=${i.videoId}`,
        title: i.title,
        uploaderName: i.author,
        duration: i.lengthSeconds,
        thumbnail: i.videoThumbnails?.[0]?.url ?? null,
        type: "stream",
      }));
    } catch {
      throw new Error("البحث فشل، جرّب تاني");
    }
  }

  return items.slice(0, 18).map((item: any) => {
    const videoId = (item.url ?? "").replace("/watch?v=", "");
    return {
      videoId,
      title: item.title ?? "بدون عنوان",
      artist: item.uploaderName ?? "فنان غير معروف",
      duration: formatDuration(typeof item.duration === "number" ? item.duration : 0),
      thumbnail: item.thumbnail ?? null,
      streamUrl: `yt:${videoId}`,
    };
  });
}

export async function resolveStreamUrl(videoId: string): Promise<string> {
  let url: string | null = null;

  try {
    const data = await pipedFetch(`/streams/${videoId}`);
    const streams: any[] = data.audioStreams ?? [];
    const best = streams
      .filter((s) => s.url && s.mimeType)
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    if (best?.url) url = best.url;
  } catch {}

  if (!url) {
    try {
      const data = await invidiousFetch(`/api/v1/videos/${videoId}?fields=adaptiveFormats`);
      const formats: any[] = data.adaptiveFormats ?? [];
      const audioOnly = formats
        .filter((f) => f.type?.startsWith("audio/") && f.url)
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      if (audioOnly[0]?.url) url = audioOnly[0].url;
    } catch {}
  }

  if (!url) throw new Error("تعذّر تحميل الأغنية");
  return url;
}
