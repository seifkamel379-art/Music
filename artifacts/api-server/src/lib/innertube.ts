import { Innertube } from "youtubei.js";
import { logger } from "./logger";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

let client: Innertube | null = null;
let clientCreatedAt = 0;
const TTL = 60 * 60 * 1000;

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

const YTDLP_BASE = [
  "--no-warnings", "--no-check-certificate", "--geo-bypass",
  "--socket-timeout", "10", "--no-update",
];

export async function resolveHlsUrl(videoId: string): Promise<string> {
  const { stdout } = await execFileAsync("yt-dlp", [
    ...YTDLP_BASE,
    "-f", "bestaudio",
    "--get-url",
    `https://www.youtube.com/watch?v=${videoId}`,
  ], { timeout: 20000 });

  const url = stdout.trim().split("\n")[0];
  if (!url) throw new Error("No URL returned from yt-dlp");
  return url;
}
