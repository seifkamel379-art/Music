import { Innertube } from "youtubei.js";
import { Readable } from "stream";
import { logger } from "./logger";

let client: Innertube | null = null;
let clientCreatedAt = 0;
const TTL = 55 * 60 * 1000;

export async function getClient(): Promise<Innertube> {
  if (client && Date.now() - clientCreatedAt < TTL) return client;
  logger.info("Initializing Innertube client");
  client = await Innertube.create({});
  clientCreatedAt = Date.now();
  logger.info("Innertube client ready");
  return client;
}

function fmtDuration(seconds: number): string {
  const n = Math.floor(seconds ?? 0);
  if (!n) return "0:00";
  return `${Math.floor(n / 60)}:${(n % 60).toString().padStart(2, "0")}`;
}

function upgradeThumbnail(url: string): string {
  if (url.includes("lh3.googleusercontent.com")) {
    return url.replace(/=w\d+.*$/, "=w480-h480-l90-rj");
  }
  if (url.includes("i.ytimg.com")) {
    return url
      .replace(/\/hqdefault\.jpg(\?.*)?$/, "/sddefault.jpg")
      .replace(/\/mqdefault\.jpg(\?.*)?$/, "/sddefault.jpg")
      .replace(/\/default\.jpg(\?.*)?$/, "/sddefault.jpg");
  }
  return url;
}

function bestThumbnail(thumbnails: Array<{ url?: string; width?: number }> | undefined, videoId: string): string {
  if (thumbnails && thumbnails.length > 0) {
    const sorted = [...thumbnails].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    const best = sorted[0]?.url;
    if (best) return upgradeThumbnail(best);
  }
  return `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`;
}

export type TrackMeta = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
};

export async function searchTracks(query: string): Promise<TrackMeta[]> {
  const yt = await getClient();

  try {
    const musicResults = await yt.music.search(query, { type: "song" });
    const contents: any[] =
      (musicResults as any)?.songs?.contents ??
      (musicResults as any)?.contents?.[0]?.contents ??
      [];

    const items: TrackMeta[] = [];
    for (const item of contents) {
      const id: string = item.id ?? item.video_id ?? "";
      if (!id) continue;

      const title: string = item.title ?? item.name ?? "بدون عنوان";

      const artistRaw = item.artists?.[0]?.name
        ?? item.author?.name
        ?? item.subtitle?.runs?.find((r: any) => r.endpoint?.pageType === "MUSIC_PAGE_TYPE_ARTIST")?.text
        ?? item.subtitle?.runs?.[0]?.text
        ?? "فنان غير معروف";

      const durationRaw: string =
        item.duration?.text
        ?? (item.duration?.seconds != null ? fmtDuration(item.duration.seconds) : "0:00");

      const thumb: string = bestThumbnail(item.thumbnails, id);

      items.push({ videoId: id, title, artist: artistRaw, duration: durationRaw, thumbnail: thumb });
      if (items.length >= 20) break;
    }

    if (items.length > 0) {
      logger.info({ count: items.length, query }, "YT Music search OK");
      return items;
    }
    logger.warn({ query }, "YT Music search returned 0 results, falling back to YT");
  } catch (e) {
    logger.warn({ err: e, query }, "YT Music search failed, falling back to YT");
  }

  const results = await yt.search(query, { type: "video" });
  const videos = (results as any)?.videos ?? [];
  const items: TrackMeta[] = [];

  for (const v of videos) {
    const id: string = v.video_id ?? v.id ?? "";
    if (!id) continue;
    const title: string = v.title?.text ?? v.title ?? "بدون عنوان";
    const artist: string =
      v.author?.name ?? v.short_byline_text?.runs?.[0]?.text ?? "فنان غير معروف";
    const duration: string =
      v.length_text?.text ?? fmtDuration(v.duration?.seconds ?? 0);
    const thumb: string = bestThumbnail(v.thumbnails, id);
    items.push({ videoId: id, title, artist, duration, thumbnail: thumb });
    if (items.length >= 20) break;
  }

  return items;
}

/* ── Cloudflare Worker resolver (primary, when WORKER_URL is set) ──────────
 *
 * Calls the deployed Cloudflare Worker which runs on edge IPs rarely
 * blocked by YouTube.
 */
async function getAudioUrlFromWorker(videoId: string): Promise<string | null> {
  const workerUrl = process.env["WORKER_URL"];
  if (!workerUrl) return null;

  try {
    const authKey = process.env["WORKER_AUTH_KEY"];
    const url = new URL(`${workerUrl.replace(/\/$/, "")}/url`);
    url.searchParams.set("id", videoId);
    if (authKey) url.searchParams.set("key", authKey);

    logger.info({ videoId }, "Calling Cloudflare Worker resolver");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      logger.warn({ videoId, status: res.status }, "Cloudflare Worker returned error");
      return null;
    }

    const data = await res.json() as { url?: string };
    if (data.url) {
      logger.info({ videoId, cached: (data as any).cached }, "Cloudflare Worker resolved URL OK");
      return data.url;
    }
  } catch (e) {
    logger.warn({ err: e, videoId }, "Cloudflare Worker call failed");
  }

  return null;
}

/* ── Local Innertube: get direct audio CDN URL ──────────────────────────── */
async function getAudioUrlLocal(videoId: string): Promise<string | null> {
  const clients = ["IOS", "ANDROID", "TV_EMBEDDED"] as const;

  for (const clientType of clients) {
    try {
      logger.info({ videoId, clientType }, "Innertube (local) resolving audio URL");
      const yt = await getClient();
      const info = await yt.getBasicInfo(videoId, clientType);
      const adaptiveFormats: any[] = (info.streaming_data?.adaptive_formats ?? []) as any[];

      const audioFormats = adaptiveFormats.filter(
        (f: any) => f.has_audio && !f.has_video && typeof f.url === "string" && (f.url as string).startsWith("http"),
      );

      if (audioFormats.length === 0) {
        logger.warn({ videoId, clientType, total: adaptiveFormats.length }, "No plain-URL audio formats");
        continue;
      }

      const best = audioFormats.sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
      logger.info({ videoId, clientType, bitrate: best.bitrate }, "Innertube (local) audio URL OK");
      return best.url as string;
    } catch (e) {
      logger.warn({ err: e, videoId, clientType }, "Innertube (local) audio URL failed for client");
    }
  }

  logger.warn({ videoId }, "All local Innertube clients failed");
  return null;
}

/* ── Public: getAudioUrl — Worker first, local fallback ─────────────────── */
export async function getAudioUrl(videoId: string): Promise<string | null> {
  const workerUrl = await getAudioUrlFromWorker(videoId);
  if (workerUrl) return workerUrl;
  return getAudioUrlLocal(videoId);
}

/* ── Stream helper: fetch a URL and return as Node Readable ─────────────── */
async function fetchAsStream(url: string, contentType: string): Promise<{
  stream: Readable; contentType: string; cleanup: () => void;
} | null> {
  try {
    const controller = new AbortController();
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)", "Range": "bytes=0-" },
    });
    if (!res.ok || !res.body) return null;
    const ct = res.headers.get("content-type") ?? contentType;
    const readable = Readable.fromWeb(res.body as any);
    return { stream: readable, contentType: ct, cleanup: () => { try { controller.abort(); } catch {} } };
  } catch {
    return null;
  }
}

/* ── Audio stream: Worker → Innertube download() → null (caller tries Invidious) */
export async function getAudioStream(videoId: string): Promise<{
  stream: Readable;
  contentType: string;
  cleanup: () => void;
} | null> {
  /* 1. Try Cloudflare Worker URL → stream via server */
  const workerAudioUrl = await getAudioUrlFromWorker(videoId);
  if (workerAudioUrl) {
    const result = await fetchAsStream(workerAudioUrl, "audio/mp4");
    if (result) {
      logger.info({ videoId }, "Streaming via Cloudflare Worker URL");
      return result;
    }
  }

  /* 2. Try local Innertube download() */
  const clients = ["IOS", "ANDROID"] as const;
  for (const clientType of clients) {
    try {
      logger.info({ videoId, clientType }, "Innertube download() streaming");
      const yt = await getClient();
      const webStream = await yt.download(videoId, { type: "audio", quality: "best", client: clientType });
      const readable = Readable.fromWeb(webStream as any);
      logger.info({ videoId, clientType }, "Innertube download() OK");
      return { stream: readable, contentType: "audio/mp4", cleanup: () => { readable.destroy(); } };
    } catch (e) {
      logger.warn({ err: e, videoId, clientType }, "Innertube download() failed");
    }
  }

  logger.warn({ videoId }, "All stream sources failed, caller will try Invidious");
  return null;
}
