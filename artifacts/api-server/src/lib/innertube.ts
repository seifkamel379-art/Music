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

/* ── Innertube: get direct audio CDN URL (no yt-dlp, no cookies) ──────────
 *
 * IOS/ANDROID clients return plain (non-ciphered) audio URLs directly.
 * We read from streaming_data.adaptive_formats to get the URL without
 * needing JavaScript-based decipher.
 */
export async function getAudioUrl(videoId: string): Promise<string | null> {
  const clients = ["IOS", "ANDROID", "TV_EMBEDDED"] as const;

  for (const clientType of clients) {
    try {
      logger.info({ videoId, clientType }, "Innertube resolving audio URL");
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
      logger.info({ videoId, clientType, bitrate: best.bitrate }, "Innertube audio URL OK");
      return best.url as string;
    } catch (e) {
      logger.warn({ err: e, videoId, clientType }, "Innertube audio URL failed for client");
    }
  }

  logger.warn({ videoId }, "All Innertube clients failed for audio URL");
  return null;
}

/* ── Innertube: audio stream via youtubei.js download() ─────────────────── */
export async function getAudioStream(videoId: string): Promise<{
  stream: Readable;
  contentType: string;
  cleanup: () => void;
} | null> {
  const clients = ["IOS", "ANDROID"] as const;

  for (const clientType of clients) {
    try {
      logger.info({ videoId, clientType }, "Innertube download() streaming");
      const yt = await getClient();
      const webStream = await yt.download(videoId, {
        type: "audio",
        quality: "best",
        client: clientType,
      });

      const readable = Readable.fromWeb(webStream as any);
      logger.info({ videoId, clientType }, "Innertube download() OK");
      return {
        stream: readable,
        contentType: "audio/mp4",
        cleanup: () => { readable.destroy(); },
      };
    } catch (e) {
      logger.warn({ err: e, videoId, clientType }, "Innertube download() failed for client");
    }
  }

  logger.warn({ videoId }, "All Innertube download clients failed, will try Invidious");
  return null;
}
