import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { spawn } from "child_process";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { searchTracks, getAudioStream } from "../lib/innertube";

const router: IRouter = Router();
const PASSWORD = "16168080";

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

/* ── Login ──────────────────────────────────────────────────────────────── */
router.post("/music/login", (req, res) => {
  const p = z.object({ name: z.string().trim().min(1), password: z.string() }).safeParse(req.body);
  if (!p.success || p.data.password !== PASSWORD) {
    res.status(401).json({ message: "Wrong password" });
    return;
  }
  res.json({ ok: true, name: p.data.name });
});

/* ── Search (Innertube) ─────────────────────────────────────────────────── */
router.get("/music/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) { res.json([]); return; }

    const cached = getCached(q);
    if (cached) { res.json(cached); return; }

    const tracks = await searchTracks(q);
    const result = tracks.map(t => ({
      ...t,
      streamUrl: `yt:${t.videoId}`,
    }));

    setCache(q, result);
    res.json(result);
  } catch (e) {
    logger.error({ err: e }, "Search failed");
    next(e);
  }
});

/* ── Stream URL resolver → always returns our own stream endpoint ────────── */
router.get("/music/stream-url", (req: Request, res: Response) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ url: `/api/music/stream?id=${encodeURIComponent(id)}` });
});

/* ── Core: stream audio via Innertube → ffmpeg → MP3 ────────────────────── */
async function streamMp3(
  res: Response,
  videoId: string,
  bitrate: "128k" | "192k",
  onHeaders: () => void,
  next: NextFunction,
) {
  let audioSource: import("stream").Readable;
  try {
    audioSource = await getAudioStream(videoId);
  } catch (e) {
    logger.error({ err: e, videoId }, "Innertube getAudioStream failed");
    if (!res.headersSent) next(e);
    return;
  }

  const ff = spawn("ffmpeg", [
    "-i", "pipe:0",
    "-vn", "-ar", "44100", "-ac", "2",
    "-b:a", bitrate, "-f", "mp3", "-",
  ], { stdio: ["pipe", "pipe", "pipe"] });

  let ffmpegStderr = "";
  let sentAudio = false;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    audioSource.destroy();
    try { ff.kill("SIGKILL"); } catch {}
  };

  ff.stderr.on("data", chunk => { ffmpegStderr = `${ffmpegStderr}${chunk}`.slice(-2000); });
  ff.on("error", e => {
    logger.error({ err: e, videoId }, "ffmpeg process failed");
    if (!res.headersSent) next(e); else if (!res.writableEnded) res.end();
  });
  ff.stdin.on("error", () => {});
  audioSource.on("error", e => {
    logger.error({ err: e, videoId }, "Innertube audio source error");
    cleanup();
    if (!res.writableEnded) res.end();
  });

  onHeaders();
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  audioSource.pipe(ff.stdin);
  res.on("close", cleanup);

  ff.stdout.on("data", chunk => { sentAudio = true; res.write(chunk); });
  ff.stdout.on("end", () => { if (!res.writableEnded) res.end(); });
  ff.on("close", code => {
    if (!sentAudio) logger.error({ code, videoId, ffmpegStderr }, "No audio output from ffmpeg");
    if (!res.writableEnded) res.end();
  });
}

/* ── Stream (web + mobile) ──────────────────────────────────────────────── */
router.get("/music/stream", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }
  await streamMp3(res, id, "128k", () => {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.setHeader("Accept-Ranges", "none");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }, next);
});

/* ── Download ───────────────────────────────────────────────────────────── */
router.get("/music/download", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  const safeTitle = rawTitle
    .replace(/[^\w\u0600-\u06FF\s\-().]/g, "").trim()
    .replace(/\s+/g, "_").slice(0, 120) || `track-${id}`;
  const filename = `${safeTitle}.mp3`;

  await streamMp3(res, id, "192k", () => {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="track.mp3"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }, next);
});

export default router;
