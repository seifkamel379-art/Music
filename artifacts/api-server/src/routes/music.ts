import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { Readable } from "stream";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();
const PASSWORD = "16168080";
const execFileAsync = promisify(execFile);

/* ── Piped instances for audio resolution (faster/more reliable than yt-dlp on cloud) ── */
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.projectsegfau.lt",
  "https://piped-api.garudalinux.org",
  "https://watchapi.whatever.social",
];

async function resolvePipedAudioUrl(videoId: string): Promise<{ url: string; mime: string } | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}/streams/${videoId}`, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; musicsk/1.0)" },
      });
      if (!res.ok) continue;
      const data = await res.json() as any;
      const streams: any[] = data.audioStreams ?? [];
      if (!streams.length) continue;

      /* Prefer m4a/mp4 (wider device support), sort by bitrate */
      const sorted = [...streams].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const best =
        sorted.find(s => (s.mimeType ?? "").includes("mp4") || (s.mimeType ?? "").includes("m4a")) ??
        sorted[0];

      if (best?.url) return { url: best.url, mime: best.mimeType ?? "audio/mp4" };
    } catch { /* try next */ }
  }
  return null;
}

/* Proxy an upstream audio URL to the response */
async function proxyAudioStream(
  upstreamUrl: string,
  mime: string,
  req: Request,
  res: Response,
): Promise<boolean> {
  try {
    const rangeHeader = req.headers["range"];
    const upstreamRes = await fetch(upstreamUrl, {
      headers: {
        ...(rangeHeader ? { Range: rangeHeader } : {}),
        "User-Agent": "Mozilla/5.0 (compatible; musicsk/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) return false;
    if (!upstreamRes.body) return false;

    res.setHeader("Content-Type", mime);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache");

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const contentRange = upstreamRes.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);

    if (upstreamRes.status === 206) res.status(206);

    const nodeStream = Readable.fromWeb(upstreamRes.body as any);
    await new Promise<void>((resolve, reject) => {
      nodeStream.pipe(res);
      nodeStream.on("end", resolve);
      nodeStream.on("error", reject);
      req.on("close", () => nodeStream.destroy());
    });
    return true;
  } catch {
    return false;
  }
}

/* ── yt-dlp fallback (spawn process) ── */
const YTDLP_BASE_FLAGS = [
  "--no-warnings",
  "--no-check-certificate",
  "--geo-bypass",
  "--socket-timeout", "15",
  "--retries", "3",
  "--fragment-retries", "3",
];

function spawnYtdlpMp3(videoId: string, quality = "0") {
  return spawn("yt-dlp", [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", quality,
    "-o", "-",
    ...YTDLP_BASE_FLAGS,
    "--no-playlist",
    `https://www.youtube.com/watch?v=${videoId}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
}

function pipeYtdlp(videoId: string, quality: string, req: Request, res: Response, next: NextFunction) {
  const ytdlp = spawnYtdlpMp3(videoId, quality);
  ytdlp.stderr.on("data", () => {});
  ytdlp.on("error", (err) => {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  });
  req.on("close", () => { try { ytdlp.kill("SIGKILL"); } catch {} });
  ytdlp.on("close", () => { if (!res.writableEnded) res.end(); });
  ytdlp.stdout.pipe(res, { end: true });
}

/* ──────────────────────────────────────────── */

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

/* Search — used by mobile app & as browser fallback */
router.get("/music/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) { res.json([]); return; }

    let stdout = "";
    try {
      const result = await execFileAsync("yt-dlp", [
        "--flat-playlist",
        "--dump-json",
        ...YTDLP_BASE_FLAGS,
        `ytsearch10:${q}`,
      ], { timeout: 40000 });
      stdout = result.stdout;
    } catch (err: any) {
      stdout = err?.stdout ?? "";
      if (!stdout.trim()) { res.json([]); return; }
    }

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

/* Stream — Piped first, yt-dlp fallback */
router.get("/music/stream", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  /* 1. Try Piped */
  const piped = await resolvePipedAudioUrl(id);
  if (piped) {
    const ok = await proxyAudioStream(piped.url, piped.mime, req, res);
    if (ok) return;
  }

  /* 2. Fallback: yt-dlp */
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Accept-Ranges", "none");
  pipeYtdlp(id, "0", req, res, next);
});

/* Download — Piped first, yt-dlp fallback */
router.get("/music/download", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  const safeTitle = rawTitle
    .replace(/[^\w\u0600-\u06FF\s\-().]/g, "")
    .trim().replace(/\s+/g, "_").slice(0, 120) || `track-${id}`;
  const filename = `${safeTitle}.mp3`;

  res.setHeader("Content-Disposition", `attachment; filename="track.mp3"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");

  /* 1. Try Piped */
  const piped = await resolvePipedAudioUrl(id);
  if (piped) {
    res.setHeader("Content-Type", piped.mime);
    const ok = await proxyAudioStream(piped.url, piped.mime, req, res);
    if (ok) return;
  }

  /* 2. Fallback: yt-dlp (lower quality for speed) */
  res.setHeader("Content-Type", "audio/mpeg");
  pipeYtdlp(id, "5", req, res, next);
});

export default router;
