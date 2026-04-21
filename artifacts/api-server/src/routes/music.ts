import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { type Readable } from "stream";
import type { Request, Response, NextFunction } from "express";
import { spawn } from "child_process";
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
  "https://invidious.projectsegfau.lt",
  "https://invidious.flokinet.to",
  "https://vid.puffyan.us",
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

/* ── Stream resolution helpers ───────────────────────────────────────────── */

type StreamResult = {
  stream: Readable;
  contentType: string;
  cleanup: () => void;
};

/** Try Invidious instances for a proxied audio stream (fallback). */
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

/** Stream via yt-dlp using YOUTUBE_COOKIE env var (final, most reliable fallback). */
function tryYtDlp(videoId: string): Promise<StreamResult | null> {
  return new Promise((resolve) => {
    const cookie = process.env["YOUTUBE_COOKIE"];
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      "-f", "bestaudio[ext=m4a]/bestaudio",
      "-o", "-",
      "--no-warnings",
      "--no-playlist",
      "--quiet",
    ];
    if (cookie) args.push("--add-header", `Cookie:${cookie}`);
    args.push("--", url);

    let child;
    try {
      child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      logger.warn({ err: e, videoId }, "yt-dlp spawn failed");
      resolve(null);
      return;
    }

    let stderr = "";
    child.stderr.on("data", (b) => { stderr += b.toString().slice(0, 500); });

    let resolved = false;
    const cleanup = () => { try { child.kill("SIGKILL"); } catch {} };

    // Resolve as soon as we get the first byte of audio data.
    child.stdout.once("data", () => {
      if (resolved) return;
      resolved = true;
      logger.info({ videoId }, "yt-dlp streaming OK");
      resolve({ stream: child.stdout as unknown as Readable, contentType: "audio/mp4", cleanup });
    });

    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      logger.warn({ err, videoId }, "yt-dlp process error");
      resolve(null);
    });

    child.on("close", (code) => {
      if (resolved) return;
      resolved = true;
      logger.warn({ videoId, code, stderr }, "yt-dlp exited before producing data");
      resolve(null);
    });
  });
}

/** Resolve stream: Innertube → Invidious → yt-dlp (with cookies). */
async function resolveStream(videoId: string): Promise<StreamResult | null> {
  const innertubeResult = await getAudioStream(videoId);
  if (innertubeResult) {
    logger.info({ videoId }, "Streaming via Innertube");
    return innertubeResult;
  }
  logger.warn({ videoId }, "Innertube failed, trying Invidious proxy");
  const invResult = await tryInvidious(videoId);
  if (invResult) return invResult;
  logger.warn({ videoId }, "Invidious failed, trying yt-dlp");
  return tryYtDlp(videoId);
}

/* ── Stream endpoint (used as in-browser playback fallback if needed) ────── */
router.get("/music/stream", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  try {
    const result = await resolveStream(id);
    if (!result) {
      res.status(503).json({ message: "Stream unavailable" });
      return;
    }

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
    if (!res.headersSent) res.status(503).json({ message: "Stream unavailable" });
    else if (!res.writableEnded) res.end();
  }
});

/* ── Download endpoint ──────────────────────────────────────────────────── */

/** Strip only filesystem-illegal chars; keep spaces, Arabic, dashes, parens. */
function makeSafeFilename(rawTitle: string): string {
  const cleaned = rawTitle
    .replace(/[\/\\:*?"<>|\x00-\x1f]/g, "") // illegal on Windows/POSIX
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return cleaned || "track";
}

router.get("/music/download", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  const safeTitle = makeSafeFilename(rawTitle);

  try {
    // Resolve BEFORE setting any download headers, so a failure returns clean JSON
    // instead of an HTML error page that the browser would save as a file.
    const result = await resolveStream(id);
    if (!result) {
      res.status(503).json({ message: "Download unavailable" });
      return;
    }

    const ext = result.contentType.includes("webm") ? "webm"
      : result.contentType.includes("mp4") ? "m4a" : "mp3";
    const dlFilename = `${safeTitle}.${ext}`;

    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeTitle.replace(/"/g, "")}.${ext}"; filename*=UTF-8''${encodeURIComponent(dlFilename)}`,
    );
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    res.on("close", result.cleanup);
    result.stream.pipe(res);
    result.stream.on("error", () => { if (!res.writableEnded) res.end(); });
  } catch (e) {
    logger.error({ err: e, id }, "Download failed");
    if (!res.headersSent) res.status(503).json({ message: "Download unavailable" });
    else if (!res.writableEnded) res.end();
  }
});

export default router;
