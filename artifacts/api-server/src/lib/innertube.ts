import { Innertube } from "youtubei.js";
import { Readable } from "stream";
import { spawn } from "child_process";
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
  const results = await yt.search(query, { type: "video" });

  const videos = (results as any)?.videos ?? [];
  const items: TrackMeta[] = [];

  for (const v of videos) {
    const id: string = v.video_id ?? v.id ?? "";
    if (!id) continue;
    const title: string = v.title?.text ?? v.title ?? "بدون عنوان";
    const artist: string = v.author?.name ?? v.short_byline_text?.runs?.[0]?.text ?? "فنان غير معروف";
    const duration: string = v.length_text?.text ?? fmtDuration(v.duration?.seconds ?? 0);
    const thumb: string = v.thumbnails?.[0]?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    items.push({ videoId: id, title, artist, duration, thumbnail: thumb });
    if (items.length >= 15) break;
  }

  return items;
}

/* ── yt-dlp audio stream ──────────────────────────────────────────────────── *
 *
 * Strategy: IOS player client returns m3u8 HLS audio streams (formats 233/234)
 * that work even from datacenter IPs. Cookies must NOT be passed because they
 * interfere with the iOS client and cause YouTube to return only storyboards.
 *
 * Format priority: bestaudio[ext=mp4] → bestaudio → format 234 (high) → 233 (low)
 */
export function getAudioStream(videoId: string): {
  stdout: Readable;
  stderr: Readable;
  kill: () => void;
} {
  const args: string[] = [
    "--no-warnings",
    "--no-check-certificate",
    "--geo-bypass",
    "--socket-timeout", "20",
    "--no-update",
    "--no-playlist",
    "--extractor-args", "youtube:player_client=ios",
    "-f", "bestaudio[ext=mp4]/bestaudio/234/233",
    "-o", "-",
    `https://www.youtube.com/watch?v=${videoId}`,
  ];

  logger.info({ videoId }, "yt-dlp streaming via IOS client");

  const proc = spawn("yt-dlp", args, { stdio: ["pipe", "pipe", "pipe"] });

  return {
    stdout: proc.stdout,
    stderr: proc.stderr,
    kill: () => { try { proc.kill("SIGKILL"); } catch {} },
  };
}
