import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { spawn } from "child_process";
import { PassThrough, type Readable } from "stream";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { searchTracks, getAudioStream, getAudioUrl } from "../lib/innertube";

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

/* ── URL cache (CDN URLs are valid ~6 hours) ───────────────────────────── */
const urlCache = new Map<string, { url: string; time: number }>();
const URL_TTL = 4 * 60 * 60 * 1000;

function getCachedUrl(videoId: string): string | null {
  const c = urlCache.get(videoId);
  return c && Date.now() - c.time < URL_TTL ? c.url : null;
}
function setCachedUrl(videoId: string, url: string) {
  if (urlCache.size >= 200) {
    const [k] = [...urlCache.entries()].sort((a, b) => a[1].time - b[1].time)[0];
    urlCache.delete(k);
  }
  urlCache.set(videoId, { url, time: Date.now() });
}

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

/* ── URL endpoint (returns direct CDN URL for browser playback) ─────────── */
router.get("/music/url", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  try {
    const cached = getCachedUrl(id);
    if (cached) {
      res.json({ url: cached });
      return;
    }

    const url = await getAudioUrl(id);
    if (!url) {
      res.status(503).json({ message: "Could not resolve audio URL" });
      return;
    }

    setCachedUrl(id, url);
    res.setHeader("Cache-Control", "no-cache");
    res.json({ url });
  } catch (e) {
    logger.error({ err: e, id }, "URL resolution failed");
    next(e);
  }
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */

type StreamResult = {
  stream: Readable;
  contentType: string;
  cleanup: () => void;
};

/** Try yt-dlp (android_vr client). Resolves with stream on first bytes, null on failure. */
function tryYtdlp(videoId: string): Promise<StreamResult | null> {
  return new Promise(resolve => {
    const source = getAudioStream(videoId);
    const pass = new PassThrough();

    let settled = false;
    let ytdlpStderr = "";

    const cleanup = () => {
      source.kill();
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    };

    const timeout = setTimeout(fail, 25000);

    source.stderr.on("data", (c: Buffer) => { ytdlpStderr = `${ytdlpStderr}${c}`.slice(-2000); });
    source.stdout.on("error", fail);

    source.stdout.once("data", (firstChunk: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      pass.write(firstChunk);
      source.stdout.pipe(pass);

      resolve({ stream: pass, contentType: "audio/mp4", cleanup });
    });

    source.stdout.on("close", () => {
      clearTimeout(timeout);
      if (!settled) {
        logger.warn({ videoId, ytdlpStderr }, "yt-dlp exited with no output");
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
async function resolveStream(videoId: string): Promise<StreamResult> {
  const ytdlpResult = await tryYtdlp(videoId);
  if (ytdlpResult) {
    logger.info({ videoId }, "Streaming via yt-dlp (android_vr)");
    return ytdlpResult;
  }
  logger.warn({ videoId }, "yt-dlp failed, trying Invidious proxy");
  const invResult = await tryInvidious(videoId);
  if (invResult) return invResult;
  throw new Error("All stream sources failed for " + videoId);
}

/* ── Stream endpoint (server proxy fallback) ────────────────────────────── */
router.get("/music/stream", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  try {
    const result = await resolveStream(id);

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

  try {
    const result = await resolveStream(id);

    const ext = result.contentType.includes("webm") ? "webm"
      : result.contentType.includes("mp4") ? "m4a" : "mp3";
    const dlFilename = `${safeTitle}.${ext}`;

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
