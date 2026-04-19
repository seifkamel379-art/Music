import { Router, type IRouter } from "express";
import { z } from "zod/v4";

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
      streamUrl: `${EXTERNAL_API}/api/proxy?id=${item.videoId}`,
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

    const upstream = await fetch(`${EXTERNAL_API}/api/proxy?id=${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ message: "Stream error" });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "audio/mp4";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const reader = upstream.body!.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    pump().catch((err) => {
      if (!res.writableEnded) res.end();
      console.error("[stream proxy]", err);
    });

    req.on("close", () => reader.cancel());
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

    const asciiFilename = `track-${id}.m4a`;
    const utf8Filename = encodeURIComponent(`${safeTitle}.m4a`);

    const upstream = await fetch(`${EXTERNAL_API}/api/proxy?id=${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ message: "Download error" });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "audio/mp4";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const reader = upstream.body!.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    pump().catch((err) => {
      if (!res.writableEnded) res.end();
      console.error("[download proxy]", err);
    });

    req.on("close", () => reader.cancel());
  } catch (error) {
    if (!res.headersSent) next(error);
    else if (!res.writableEnded) res.end();
  }
});

export default router;
