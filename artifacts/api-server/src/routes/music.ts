import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { searchTracks } from "../lib/innertube";

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
