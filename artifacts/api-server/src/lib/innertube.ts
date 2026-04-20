import { Innertube } from "youtubei.js";
import { logger } from "./logger";

let client: Innertube | null = null;
let clientCreatedAt = 0;
const TTL = 55 * 60 * 1000;

export async function getClient(): Promise<Innertube> {
  if (client && Date.now() - clientCreatedAt < TTL) return client;
  logger.info("Initializing Innertube client");
  client = await Innertube.create({ generate_session_locally: true });
  clientCreatedAt = Date.now();
  logger.info("Innertube client ready");
  return client;
}

function fmtDuration(seconds: number): string {
  const n = Math.floor(seconds ?? 0);
  if (!n) return "0:00";
  return `${Math.floor(n / 60)}:${(n % 60).toString().padStart(2, "0")}`;
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

  /* ── YouTube Music search (songs first) ──────────────────────────────── */
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

      const title: string =
        item.title ?? item.name ?? "بدون عنوان";

      const artistRaw = item.artists?.[0]?.name
        ?? item.author?.name
        ?? item.subtitle?.runs?.find((r: any) => r.endpoint?.pageType === "MUSIC_PAGE_TYPE_ARTIST")?.text
        ?? item.subtitle?.runs?.[0]?.text
        ?? "فنان غير معروف";

      const durationRaw: string =
        item.duration?.text
        ?? (item.duration?.seconds != null ? fmtDuration(item.duration.seconds) : "0:00");

      const thumb: string =
        item.thumbnails?.[0]?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

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

  /* ── Fallback: regular YouTube search ───────────────────────────────── */
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
    const thumb: string =
      v.thumbnails?.[0]?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    items.push({ videoId: id, title, artist, duration, thumbnail: thumb });
    if (items.length >= 20) break;
  }

  return items;
}
