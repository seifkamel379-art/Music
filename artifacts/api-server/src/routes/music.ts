import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();
const PASSWORD = "16168080";
const EXTERNAL_API = "https://youtube-stream-api--seifmusic7.replit.app";

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

router.get("/music/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) { res.json([]); return; }

    const upstream = await fetch(`${EXTERNAL_API}/api/search?q=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(15000),
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

async function proxyAudio(req: Request, res: Response, next: NextFunction, asDownload: boolean) {
  try {
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (!id) { res.status(400).json({ message: "Missing id" }); return; }

    const headers: Record<string, string> = {};
    if (req.headers.range) headers["Range"] = req.headers.range;

    const upstream = await fetch(`${EXTERNAL_API}/api/proxy?id=${encodeURIComponent(id)}`, {
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).json({ message: "Stream error" });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "audio/mp4";
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);

    if (asDownload) {
      const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";
      const safeTitle = rawTitle.replace(/[^\w\u0600-\u06FF\s\-().]/g, "").trim().replace(/\s+/g, "_").slice(0, 120) || `track-${id}`;
      const ext = contentType.includes("mp4") ? "m4a" : "mp3";
      res.setHeader("Content-Disposition", `attachment; filename="track-${id}.${ext}"; filename*=UTF-8''${encodeURIComponent(safeTitle + "." + ext)}`);
    }

    res.status(upstream.status);

    const reader = upstream.body!.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.writableEnded) res.write(value);
      }
      if (!res.writableEnded) res.end();
    };
    pump().catch(() => { if (!res.writableEnded) res.end(); });
    req.on("close", () => reader.cancel().catch(() => {}));
  } catch (error) {
    if (!res.headersSent) next(error);
    else if (!res.writableEnded) res.end();
  }
}

router.get("/music/stream", (req, res, next) => proxyAudio(req, res, next, false));
router.get("/music/download", (req, res, next) => proxyAudio(req, res, next, true));

export default router;
