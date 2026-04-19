import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();
const PASSWORD = "16168080";
const execFileAsync = promisify(execFile);

const loginSchema = z.object({
  name: z.string().trim().min(1),
  password: z.string(),
});

function fmtDuration(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

/* Base flags shared by all yt-dlp calls */
const BASE = [
  "--no-warnings",
  "--no-check-certificate",
  "--geo-bypass",
  "--socket-timeout", "10",
];

router.post("/music/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.password !== PASSWORD) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  res.json({ ok: true, name: parsed.data.name });
});

/* ── Search ─────────────────────────────────────────── */
router.get("/music/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) { res.json([]); return; }

    let stdout = "";
    try {
      const result = await execFileAsync("yt-dlp", [
        "--flat-playlist",
        "--dump-json",
        ...BASE,
        `ytsearch10:${q}`,
      ], { timeout: 40000 });
      stdout = result.stdout;
    } catch (err: any) {
      /* Use partial output if available, otherwise return empty */
      stdout = err?.stdout ?? "";
      if (!stdout.trim()) { res.json([]); return; }
    }

    const tracks = stdout.trim().split("\n").filter(Boolean).flatMap((line) => {
      try {
        const item = JSON.parse(line);
        const videoId: string = item.id ?? "";
        if (!videoId) return [];
        const duration: number = typeof item.duration === "number" ? item.duration : 0;
        return [{
          videoId,
          title: item.title ?? "بدون عنوان",
          artist: item.uploader ?? item.channel ?? "فنان غير معروف",
          duration: fmtDuration(duration),
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          streamUrl: `/api/music/stream?id=${videoId}`,
        }];
      } catch { return []; }
    });

    res.json(tracks);
  } catch (error) {
    next(error);
  }
});

/* ── Stream ─────────────────────────────────────────── *
 * Uses native audio format (NO transcoding) — starts in ~2s instead of ~10s.
 * bestaudio prefers m4a/webm which Chrome/Safari play natively.
 * ─────────────────────────────────────────────────── */
router.get("/music/stream", (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  res.setHeader("Content-Type", "audio/webm");          /* m4a/webm both work in Chrome */
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Accept-Ranges", "none");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const ytdlp = spawn("yt-dlp", [
    "--format", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    "-o", "-",
    ...BASE,
    "--no-playlist",
    "--retries", "3",
    "--fragment-retries", "3",
    `https://www.youtube.com/watch?v=${id}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });

  ytdlp.stderr.on("data", () => {});
  ytdlp.on("error", (err) => {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  });
  req.on("close", () => { try { ytdlp.kill("SIGKILL"); } catch {} });
  ytdlp.on("close", () => { if (!res.writableEnded) res.end(); });
  ytdlp.stdout.pipe(res, { end: true });
});

/* ── Download ───────────────────────────────────────── *
 * Transcodes to mp3 for a universally compatible file.
 * ─────────────────────────────────────────────────── */
router.get("/music/download", (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  const safeTitle = rawTitle
    .replace(/[^\w\u0600-\u06FF\s\-().]/g, "")
    .trim().replace(/\s+/g, "_").slice(0, 120) || `track-${id}`;
  const filename = `${safeTitle}.mp3`;

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Disposition", `attachment; filename="track.mp3"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const ytdlp = spawn("yt-dlp", [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "5",
    "-o", "-",
    ...BASE,
    "--no-playlist",
    "--retries", "3",
    "--fragment-retries", "3",
    `https://www.youtube.com/watch?v=${id}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });

  ytdlp.stderr.on("data", () => {});
  ytdlp.on("error", (err) => {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  });
  req.on("close", () => { try { ytdlp.kill("SIGKILL"); } catch {} });
  ytdlp.on("close", () => { if (!res.writableEnded) res.end(); });
  ytdlp.stdout.pipe(res, { end: true });
});

export default router;
