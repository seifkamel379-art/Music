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
      `ytsearch15:${q}`,
    ], { timeout: 20000 });

    const tracks = stdout.trim().split("\n").filter(Boolean).map((line) => {
      const item = JSON.parse(line);
      const videoId: string = item.id ?? "";
      const duration: number = typeof item.duration === "number" ? item.duration : 0;
      return {
        videoId,
        title: item.title ?? "بدون عنوان",
        artist: item.uploader ?? item.channel ?? "فنان غير معروف",
        duration: fmtDuration(duration),
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hq720.jpg`,
        streamUrl: `/api/music/stream?id=${videoId}`,
      };
    }).filter((t) => t.videoId);

    res.json(tracks);
  } catch (error) {
    next(error);
  }
});

async function getAudioUrl(videoId: string): Promise<string> {
  const { stdout } = await execFileAsync("yt-dlp", [
    "-f", "bestaudio",
    "--get-url",
    "--no-warnings",
    `https://youtube.com/watch?v=${videoId}`,
  ], { timeout: 30000 });
  const url = stdout.trim().split("\n")[0];
  if (!url) throw new Error("No audio URL found");
  return url;
}

function streamAudioViaFfmpeg(audioUrl: string, res: Response, req: Request, next: NextFunction) {
  const ffmpeg = spawn("ffmpeg", [
    "-i", audioUrl,
    "-vn",
    "-acodec", "libmp3lame",
    "-ab", "128k",
    "-f", "mp3",
    "-",
  ]);

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Transfer-Encoding", "chunked");

  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on("data", () => {});
  req.on("close", () => { try { ffmpeg.kill(); } catch {} });
  ffmpeg.on("close", () => { if (!res.writableEnded) res.end(); });
  ffmpeg.on("error", (err) => {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  });
}

router.get("/music/stream", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (!id) { res.status(400).json({ message: "Missing id" }); return; }

    const audioUrl = await getAudioUrl(id);
    streamAudioViaFfmpeg(audioUrl, res, req, next);
  } catch (error) {
    next(error);
  }
});

router.get("/music/download", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";
    if (!id) { res.status(400).json({ message: "Missing id" }); return; }

    const safeTitle = rawTitle
      .replace(/[^\w\u0600-\u06FF\s\-().]/g, "")
      .trim().replace(/\s+/g, "_").slice(0, 120) || `track-${id}`;

    const audioUrl = await getAudioUrl(id);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="track-${id}.mp3"; filename*=UTF-8''${encodeURIComponent(safeTitle + ".mp3")}`);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Transfer-Encoding", "chunked");

    const ffmpeg = spawn("ffmpeg", [
      "-i", audioUrl,
      "-vn",
      "-acodec", "libmp3lame",
      "-ab", "128k",
      "-f", "mp3",
      "-",
    ]);

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on("data", () => {});
    req.on("close", () => { try { ffmpeg.kill(); } catch {} });
    ffmpeg.on("close", () => { if (!res.writableEnded) res.end(); });
    ffmpeg.on("error", (err) => {
      if (!res.headersSent) next(err);
      else if (!res.writableEnded) res.end();
    });
  } catch (error) {
    if (!res.headersSent) next(error);
    else if (!res.writableEnded) res.end();
  }
});

export default router;
