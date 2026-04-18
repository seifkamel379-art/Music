import { Router, type IRouter } from "express";
import { z } from "zod/v4";

const router: IRouter = Router();
const PASSWORD = "16168080";
const EXTERNAL_API = "https://c68167c1-9d98-42f1-9e56-fa1768e61a90-00-tvhwnarqg09z.worf.replit.dev";

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

    const upstream = await fetch(`${EXTERNAL_API}/api/proxy?id=${encodeURIComponent(id)}`);

    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ message: "Could not fetch audio" });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
    const ext = contentType.includes("webm") ? "webm" : contentType.includes("ogg") ? "ogg" : "mp3";

    // filename= must be ASCII only; filename*= carries the full UTF-8 name
    const asciiFilename = `track-${id}.${ext}`;
    const utf8Filename = encodeURIComponent(`${safeTitle}.${ext}`);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        if (!res.writableEnded) res.write(value);
        else { reader.cancel(); break; }
      }
    };

    req.on("close", () => reader.cancel().catch(() => {}));
    await pump();
  } catch (error) {
    if (!res.headersSent) next(error);
    else if (!res.writableEnded) res.end();
  }
});

export default router;
