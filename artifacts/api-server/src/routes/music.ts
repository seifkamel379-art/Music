import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { spawn } from "child_process";
import { PassThrough, type Readable } from "stream";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { searchTracks, getAudioStream } from "../lib/innertube";

const router: IRouter = Router();
const PASSWORD = "80801616";

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.io.lol",
  "https://invidious.nerdvpn.de",
  "https://iv.ggtyler.dev",
  "https://invidious.privacydev.net",
  "https://yt.artemislena.eu",
  "https://invidious.fdn.fr",
];

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

/* ── Search ─────────────────────────────────────────────────────────────── */
router.get("/music/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) { res.json([]); return; }
    const cached = getCached(q);
    if (cached) { res.json(cached); return; }
    const tracks = await searchTracks(q);
    setCache(q, tracks);
    res.json(tracks);
  } catch (e) {
    logger.error({ err: e }, "Search failed");
    next(e);
  }
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */

type StreamResult = {
  stream: Readable;
  contentType: string;
  cleanup: () => void;
};

/** Try yt-dlp (iOS client). Resolves with stream on first bytes, null on failure. */
function tryYtdlp(videoId: string, ffmpegBitrate: "128k" | "192k"): Promise<StreamResult | null> {
  return new Promise(resolve => {
    const source = getAudioStream(videoId);
    const ff = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-vn", "-ar", "44100", "-ac", "2",
      "-b:a", ffmpegBitrate, "-f", "mp3", "-",
    ], { stdio: ["pipe", "pipe", "pipe"] });

    let settled = false;
    let ffmpegStderr = "";
    let ytdlpStderr = "";

    const cleanup = () => {
      source.kill();
      try { ff.kill("SIGKILL"); } catch {}
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    };

    const timeout = setTimeout(fail, 9000);

    source.stderr.on("data", (c: Buffer) => { ytdlpStderr = `${ytdlpStderr}${c}`.slice(-2000); });
    ff.stderr.on("data", (c: Buffer) => { ffmpegStderr = `${ffmpegStderr}${c}`.slice(-2000); });
    ff.stdin.on("error", () => {});
    source.stdout.on("error", fail);
    ff.on("error", fail);

    source.stdout.pipe(ff.stdin);

    ff.stdout.once("data", (firstChunk: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      const pass = new PassThrough();
      pass.write(firstChunk);
      ff.stdout.pipe(pass);

      resolve({
        stream: pass,
        contentType: "audio/mpeg",
        cleanup,
      });
    });

    ff.on("close", code => {
      clearTimeout(timeout);
      if (!settled) {
        logger.warn({ code, videoId, ytdlpStderr, ffmpegStderr }, "yt-dlp/ffmpeg exited with no output");
        fail();
      }
    });
  });
}

/** Try Invidious instances for a proxied audio stream. */
async function tryInvidious(videoId: string): Promise<StreamResult | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const metaRes = await fetch(
        `${instance}/api/v1/videos/${encodeURIComponent(videoId)}?fields=adaptiveFormats`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!metaRes.ok) continue;

      const data = await metaRes.json() as { adaptiveFormats?: Array<{ itag: number; type: string }> };
      const formats = data.adaptiveFormats ?? [];
      const mp4 = formats.find(f => f.type?.startsWith("audio/mp4"));
      const webm = formats.find(f => f.type?.startsWith("audio/webm"));
      const chosen = mp4 ?? webm;
      if (!chosen?.itag) continue;

      const streamUrl = `${instance}/latest_version?id=${encodeURIComponent(videoId)}&itag=${chosen.itag}`;
      const streamRes = await fetch(streamUrl, { signal: AbortSignal.timeout(10000) });
      if (!streamRes.ok || !streamRes.body) continue;

      const contentType = streamRes.headers.get("content-type") ?? "audio/mp4";
      const readable = Readable.fromWeb(streamRes.body as any);

      logger.info({ videoId, instance }, "Invidious proxy stream OK");
      return { stream: readable, contentType, cleanup: () => {} };
    } catch {
      continue;
    }
  }
  return null;
}

/** Resolve stream source: yt-dlp first, Invidious fallback. */
async function resolveStream(videoId: string, bitrate: "128k" | "192k"): Promise<StreamResult> {
  const ytdlpResult = await tryYtdlp(videoId, bitrate);
  if (ytdlpResult) {
    logger.info({ videoId }, "Streaming via yt-dlp (iOS client)");
    return ytdlpResult;
  }
  logger.warn({ videoId }, "yt-dlp failed, trying Invidious proxy");
  const invResult = await tryInvidious(videoId);
  if (invResult) return invResult;
  throw new Error("All stream sources failed for " + videoId);
}

/* ── Stream endpoint ────────────────────────────────────────────────────── */
router.get("/music/stream", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  try {
    const result = await resolveStream(id, "128k");

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.setHeader("Accept-Ranges", "none");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    res.on("close", result.cleanup);
    result.stream.pipe(res);
    result.stream.on("error", () => { if (!res.writableEnded) res.end(); });
  } catch (e) {
    logger.error({ err: e, id }, "Stream failed");
    if (!res.headersSent) next(e); else if (!res.writableEnded) res.end();
  }
});

/* ── Download endpoint ──────────────────────────────────────────────────── */
router.get("/music/download", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  const safeTitle = rawTitle
    .replace(/[^\w\u0600-\u06FF\s\-().]/g, "").trim()
    .replace(/\s+/g, "_").slice(0, 120) || `track-${id}`;
  const filename = `${safeTitle}.mp3`;

  try {
    const result = await resolveStream(id, "192k");

    const ext = result.contentType.includes("webm") ? "webm"
      : result.contentType.includes("mp4") ? "m4a" : "mp3";
    const dlFilename = result.contentType === "audio/mpeg" ? filename : `${safeTitle}.${ext}`;

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="track.${ext}"; filename*=UTF-8''${encodeURIComponent(dlFilename)}`);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    res.on("close", result.cleanup);
    result.stream.pipe(res);
    result.stream.on("error", () => { if (!res.writableEnded) res.end(); });
  } catch (e) {
    logger.error({ err: e, id }, "Download failed");
    if (!res.headersSent) next(e); else if (!res.writableEnded) res.end();
  }
});

export default router;
