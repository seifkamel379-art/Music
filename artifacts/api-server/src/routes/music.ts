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

router.post("/music/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.password !== PASSWORD) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  res.json({ ok: true, name: parsed.data.name });
});

router.get("/music/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) { res.json([]); return; }

    const { stdout } = await execFileAsync("yt-dlp", [
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      "--no-check-certificate",
      `ytsearch20:${q}`,
    ], { timeout: 25000 });

    const tracks = stdout.trim().split("\n").filter(Boolean).map((line) => {
      try {
        const item = JSON.parse(line);
        const videoId: string = item.id ?? "";
        const duration: number = typeof item.duration === "number" ? item.duration : 0;
        return {
          videoId,
          title: item.title ?? "بدون عنوان",
          artist: item.uploader ?? item.channel ?? "فنان غير معروف",
          duration: fmtDuration(duration),
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          streamUrl: `/api/music/stream?id=${videoId}`,
        };
      } catch { return null; }
    }).filter((t): t is NonNullable<typeof t> => !!t && !!t.videoId);

    res.json(tracks);
  } catch (error) {
    next(error);
  }
});

function spawnMp3Stream(videoId: string) {
  return spawn("yt-dlp", [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "-o", "-",
    "--no-warnings",
    "--no-playlist",
    "--no-check-certificate",
    "--retries", "3",
    `https://www.youtube.com/watch?v=${videoId}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
}

router.get("/music/stream", (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Accept-Ranges", "none");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const ytdlp = spawnMp3Stream(id);

  ytdlp.stderr.on("data", () => {});

  ytdlp.on("error", (err) => {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  });

  req.on("close", () => { try { ytdlp.kill("SIGKILL"); } catch {} });
  ytdlp.on("close", () => { if (!res.writableEnded) res.end(); });
  ytdlp.stdout.pipe(res, { end: true });
});

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

  const ytdlp = spawnMp3Stream(id);

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
