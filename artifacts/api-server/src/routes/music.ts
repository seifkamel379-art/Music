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

export default router;
