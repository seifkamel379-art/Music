import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();
const PASSWORD = "16168080";
const execFileAsync = promisify(execFile);

/* ── Search cache ───────────────────────────────────────────────────────── */
const searchCache = new Map<string, { data: any[]; time: number }>();
const SEARCH_TTL = 8 * 60 * 1000;

function getCached(q: string) {
  const c = searchCache.get(q);
  return c && Date.now() - c.time < SEARCH_TTL ? c.data : null;
}
function setCache(q: string, data: any[]) {
  if (searchCache.size >= 60) {
    const [k] = [...searchCache.entries()].sort((a, b) => a[1].time - b[1].time)[0];
    searchCache.delete(k);
  }
  searchCache.set(q, { data, time: Date.now() });
}

const BASE = [
  "--no-warnings", "--no-check-certificate", "--geo-bypass", "--socket-timeout", "10",
];

function fmtDuration(s: number) {
  const n = Math.floor(s);
  return `${Math.floor(n / 60)}:${(n % 60).toString().padStart(2, "0")}`;
}

/* ── Login ──────────────────────────────────────────────────────────────── */
router.post("/music/login", (req, res) => {
  const p = z.object({ name: z.string().trim().min(1), password: z.string() }).safeParse(req.body);
  if (!p.success || p.data.password !== PASSWORD) { res.status(401).json({ message: "Wrong password" }); return; }
  res.json({ ok: true, name: p.data.name });
});

/* ── Search ─────────────────────────────────────────────────────────────── */
router.get("/music/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) { res.json([]); return; }
    const cached = getCached(q);
    if (cached) { res.json(cached); return; }

    let stdout = "";
    try {
      ({ stdout } = await execFileAsync("yt-dlp", [
        "--flat-playlist", "--dump-json", ...BASE,
        `ytsearch15:${q}`,
      ], { timeout: 40000 }));
    } catch (e: any) {
      stdout = e?.stdout ?? "";
      if (!stdout.trim()) { res.json([]); return; }
    }

    const tracks = stdout.trim().split("\n").filter(Boolean).flatMap(line => {
      try {
        const item = JSON.parse(line);
        const videoId: string = item.id ?? "";
        if (!videoId) return [];
        return [{ videoId, title: item.title ?? "بدون عنوان", artist: item.uploader ?? item.channel ?? "فنان", duration: fmtDuration(typeof item.duration === "number" ? item.duration : 0), thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, streamUrl: `/api/music/stream?id=${videoId}` }];
      } catch { return []; }
    });

    setCache(q, tracks);
    res.json(tracks);
  } catch (e) { next(e); }
});

/* ── Helper: resolve direct YouTube audio URL via yt-dlp -g ─────────────── */
async function resolveAudioUrl(videoId: string): Promise<string> {
  const { stdout } = await execFileAsync("yt-dlp", [
    "-g", "--format", "bestaudio", ...BASE, "--no-playlist",
    `https://www.youtube.com/watch?v=${videoId}`,
  ], { timeout: 18000 });
  const url = stdout.trim().split("\n")[0];
  if (!url) throw new Error("empty URL from yt-dlp -g");
  return url;
}

/* ── Stream ─────────────────────────────────────────────────────────────────
   1. yt-dlp -g  → direct YouTube CDN URL  (~3s)
   2. ffmpeg -reconnect → converts to mp3 stream
   ffmpeg reconnects if the CDN drops mid-stream — much more reliable than
   letting yt-dlp handle the whole download + transcode.
   ─────────────────────────────────────────────────────────────────────────── */
router.get("/music/stream", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  let audioUrl: string;
  try {
    audioUrl = await resolveAudioUrl(id);
  } catch (e) {
    return void next(e);
  }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Accept-Ranges", "none");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const ff = spawn("ffmpeg", [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", audioUrl,
    "-vn", "-ar", "44100", "-ac", "2", "-b:a", "128k",
    "-f", "mp3", "-",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  ff.stderr.on("data", () => {});
  ff.on("error", e => { if (!res.headersSent) next(e); else if (!res.writableEnded) res.end(); });
  req.on("close", () => { try { ff.kill("SIGKILL"); } catch {} });
  ff.on("close", () => { if (!res.writableEnded) res.end(); });
  ff.stdout.pipe(res, { end: true });
});

/* ── Download ───────────────────────────────────────────────────────────────
   Same as stream but with Content-Disposition: attachment.
   Frontend opens URL directly → browser shows native download bar.
   ─────────────────────────────────────────────────────────────────────────── */
router.get("/music/download", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  const safeTitle = rawTitle
    .replace(/[^\w\u0600-\u06FF\s\-().]/g, "").trim()
    .replace(/\s+/g, "_").slice(0, 120) || `track-${id}`;
  const filename = `${safeTitle}.mp3`;

  let audioUrl: string;
  try {
    audioUrl = await resolveAudioUrl(id);
  } catch (e) {
    return void next(e);
  }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Disposition", `attachment; filename="track.mp3"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const ff = spawn("ffmpeg", [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", audioUrl,
    "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k",
    "-f", "mp3", "-",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  ff.stderr.on("data", () => {});
  ff.on("error", e => { if (!res.headersSent) next(e); else if (!res.writableEnded) res.end(); });
  req.on("close", () => { try { ff.kill("SIGKILL"); } catch {} });
  ff.on("close", () => { if (!res.writableEnded) res.end(); });
  ff.stdout.pipe(res, { end: true });
});

export default router;
