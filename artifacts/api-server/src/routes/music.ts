import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import type { Request, Response, NextFunction } from "express";
import { spawn } from "child_process";
import { logger } from "../lib/logger";
import { searchTracks, getClient } from "../lib/innertube";

const router: IRouter = Router();
const PASSWORD = "80801616";

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

/* ── Download (via loader.to public converter) ──────────────────────────── */
router.get("/music/download", async (req: Request, res: Response) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  const ytUrl = `https://youtu.be/${id}`;
  try {
    const startRes = await fetch(
      `https://loader.to/ajax/download.php?format=mp3&url=${encodeURIComponent(ytUrl)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const start = await startRes.json() as { success?: boolean; id?: string };
    if (!start.success || !start.id) {
      logger.warn({ id, start }, "loader.to start failed");
      res.status(503).json({ message: "Download service unavailable" });
      return;
    }

    const jobId = start.id;
    // Poll up to ~90s
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const pr = await fetch(
          `https://loader.to/ajax/progress.php?id=${encodeURIComponent(jobId)}`,
          { signal: AbortSignal.timeout(8000) },
        );
        const data = await pr.json() as { progress?: number; download_url?: string | null };
        if (data.progress === 1000 && data.download_url) {
          logger.info({ id, jobId }, "loader.to download ready");
          res.json({ url: data.download_url });
          return;
        }
      } catch (e) {
        logger.warn({ err: e, id, jobId }, "loader.to poll error");
      }
    }
    logger.warn({ id, jobId }, "loader.to timeout");
    res.status(504).json({ message: "Download preparation timed out" });
  } catch (e) {
    logger.error({ err: e, id }, "Download failed");
    res.status(503).json({ message: "Download service unavailable" });
  }
});

/* ── Stream URL resolution (Innertube → yt-dlp fallback) ────────────────── */
router.get("/music/url/:videoId", async (req: Request, res: Response, next: NextFunction) => {
  const videoId = typeof req.params.videoId === "string" ? req.params.videoId.trim() : "";
  if (!videoId) { res.status(400).json({ message: "Missing videoId" }); return; }

  const yt = await getClient();

  // Helper: pick best audio format.
  // fmt.url is a getter in youtubei.js v17 that may call decipher() and throw —
  // wrap each access in try/catch to skip undecipherable formats gracefully.
  function pickAudioUrl(formats: any[]): { url: string; contentType: string } | null {
    const audio = formats
      .filter((f: any) => f.has_audio && !f.has_video)
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    for (const fmt of audio) {
      try {
        const raw = fmt.url;
        const url: string | null =
          typeof raw === "string" && raw.startsWith("http") ? raw
          : raw && typeof raw === "object" && typeof raw.href === "string" ? raw.href
          : null;
        if (url) return { url, contentType: fmt.mime_type ?? "audio/webm" };
      } catch { /* skip formats that require deciphering */ }
    }
    return null;
  }

  // ── 1. Try yt.music.getInfo (best for YT-Music-exclusive tracks) ────────
  try {
    const info = await (yt as any).music.getInfo(videoId);
    const result = pickAudioUrl(info?.streaming_data?.adaptive_formats ?? []);
    if (result) {
      logger.info({ videoId, mime: result.contentType }, "music.getInfo URL resolved");
      res.json(result);
      return;
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message, videoId }, "music.getInfo failed");
  }

  // ── 2. Try getBasicInfo (WEB client) with vm-backed decipher ────────────
  try {
    const info = await (yt as any).getBasicInfo(videoId, "WEB");
    const result = pickAudioUrl(info?.streaming_data?.adaptive_formats ?? []);
    if (result) {
      logger.info({ videoId, mime: result.contentType }, "getBasicInfo URL resolved");
      res.json(result);
      return;
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message, videoId }, "getBasicInfo failed");
  }

  // ── 3. Fallback: yt-dlp with progressive format selectors ───────────────
  function ytdlpGetUrl(fmtSelector: string, extraArgs: string[] = []): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        "--get-url",
        "-f", fmtSelector,
        "--no-warnings",
        ...extraArgs,
        `https://youtu.be/${videoId}`,
      ];
      const proc = spawn("yt-dlp", args, { timeout: 25_000 });
      let out = "";
      proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
      proc.on("close", (code: number | null) => {
        const u = out.trim().split("\n")[0] ?? "";
        if (code === 0 && u) resolve(u);
        else reject(new Error(`yt-dlp(${fmtSelector}) exit ${code}`));
      });
      proc.on("error", reject);
    });
  }

  // Format priority: 140=m4a/128k, 251=webm/opus/160k, 250/249=opus lower quality
  const ytdlpAttempts: Array<[string, string[]]> = [
    ["140/251/250/249/bestaudio/best", ["--extractor-args", "youtube:player_client=web_music"]],
    ["140/251/250/249/bestaudio/best", ["--extractor-args", "youtube:player_client=mweb"]],
    ["bestaudio/best",                 ["--extractor-args", "youtube:player_client=ios"]],
    ["bestaudio/best",                 []],
    ["best",                           ["--extractor-args", "youtube:player_client=web_music"]],
  ];

  for (const [fmt, extra] of ytdlpAttempts) {
    try {
      const url = await ytdlpGetUrl(fmt, extra);
      logger.info({ videoId, fmt, extra }, "yt-dlp URL resolved");
      res.json({ url, contentType: "audio/webm" });
      return;
    } catch { /* try next */ }
  }

  logger.error({ videoId }, "All URL resolution attempts failed");
  res.status(503).json({ message: "Stream unavailable — try again shortly" });
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

export default router;
