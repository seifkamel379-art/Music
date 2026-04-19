import { Router, type IRouter } from "express";
import { z } from "zod/v4";

const router: IRouter = Router();
const PASSWORD = "16168080";
const EXTERNAL_API = "https://youtube-stream-api--seifmusic.replit.app";

const loginSchema = z.object({
  name: z.string().trim().min(1),
  password: z.string(),
});

router.post("/music/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.password !== PASSWORD) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  res.json({ ok: true, name: parsed.data.name });
});

router.get("/music/search", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) { res.json([]); return; }

    const upstream = await fetch(`${EXTERNAL_API}/api/search?q=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ message: "External API error" });
      return;
    }

    const json = await upstream.json() as any;
    const items: any[] = Array.isArray(json) ? json : (json.results ?? json.tracks ?? []);

    const tracks = items.map((item: any) => ({
      videoId: item.videoId,
      title: item.title ?? "بدون عنوان",
      artist: item.author ?? item.artist ?? "فنان غير معروف",
      duration: item.duration ?? "0:00",
      thumbnail: item.thumbnail ?? null,
      streamUrl: `/api/music/stream?id=${item.videoId}`,
    }));

    res.json(tracks);
  } catch (error) {
    next(error);
  }
});

router.get("/music/stream", async (req, res, next) => {
  try {
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (!id) { res.status(400).json({ message: "Missing id" }); return; }

    const { spawn } = await import("child_process");

    const ytUrl = `https://www.youtube.com/watch?v=${id}`;
    const ytdlp = spawn("yt-dlp", [
      "--no-playlist",
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "-o", "-",
      ytUrl,
    ]);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");

    ytdlp.stdout.pipe(res);

    ytdlp.stderr.on("data", (chunk: Buffer) => {
      console.error("[yt-dlp stream]", chunk.toString());
    });

    req.on("close", () => ytdlp.kill());

    ytdlp.on("error", (err: Error) => {
      console.error("[yt-dlp stream] spawn error", err);
      if (!res.headersSent) next(err);
      else if (!res.writableEnded) res.end();
    });

    ytdlp.on("close", (code: number) => {
      if (code !== 0) console.error(`[yt-dlp stream] exited with code ${code}`);
      if (!res.writableEnded) res.end();
    });
  } catch (error) {
    if (!res.headersSent) next(error);
    else if (!res.writableEnded) res.end();
  }
});

router.get("/music/download", async (req, res, next) => {
  try {
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";

    if (!id) { res.status(400).json({ message: "Missing id" }); return; }

    const safeTitle = rawTitle
      .replace(/[^\w\u0600-\u06FF\s\-().]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 120) || `track-${id}`;

    const asciiFilename = `track-${id}.mp3`;
    const utf8Filename = encodeURIComponent(`${safeTitle}.mp3`);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const { spawn } = await import("child_process");

    const ytUrl = `https://www.youtube.com/watch?v=${id}`;
    const ytdlp = spawn("yt-dlp", [
      "--no-playlist",
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "-o", "-",
      ytUrl,
    ]);

    ytdlp.stdout.pipe(res);

    ytdlp.stderr.on("data", (chunk: Buffer) => {
      console.error("[yt-dlp]", chunk.toString());
    });

    req.on("close", () => ytdlp.kill());

    ytdlp.on("error", (err: Error) => {
      console.error("[yt-dlp] spawn error", err);
      if (!res.headersSent) next(err);
      else if (!res.writableEnded) res.end();
    });

    ytdlp.on("close", (code: number) => {
      if (code !== 0) console.error(`[yt-dlp] exited with code ${code}`);
      if (!res.writableEnded) res.end();
    });
  } catch (error) {
    if (!res.headersSent) next(error);
    else if (!res.writableEnded) res.end();
  }
});

export default router;
