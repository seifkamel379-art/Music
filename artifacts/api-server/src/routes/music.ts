import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { Readable } from "stream";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();
const PASSWORD = "16168080";
const execFileAsync = promisify(execFile);

/* ── In-memory search cache (avoids hammering yt-dlp for same queries) ── */
const searchCache = new Map<string, { data: any[]; time: number }>();
const SEARCH_TTL = 8 * 60 * 1000; // 8 minutes

function getCached(q: string) {
  const c = searchCache.get(q);
  if (c && Date.now() - c.time < SEARCH_TTL) return c.data;
  return null;
}
function setCache(q: string, data: any[]) {
  if (searchCache.size >= 60) {
    const [oldest] = [...searchCache.entries()].sort((a, b) => a[1].time - b[1].time);
    searchCache.delete(oldest[0]);
  }
  searchCache.set(q, { data, time: Date.now() });
}

const BASE_FLAGS = [
  "--no-warnings",
  "--no-check-certificate",
  "--geo-bypass",
  "--socket-timeout", "10",
];

function fmtDuration(s: number) {
  const n = Math.floor(s);
  return `${Math.floor(n / 60)}:${(n % 60).toString().padStart(2, "0")}`;
}

/* ── Login ─────────────────────────────────────────────────────────────── */
router.post("/music/login", (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1), password: z.string() }).safeParse(req.body);
  if (!parsed.success || parsed.data.password !== PASSWORD) {
    res.status(401).json({ message: "Wrong password" }); return;
  }
  res.json({ ok: true, name: parsed.data.name });
});

/* ── Search ─────────────────────────────────────────────────────────────
   Returns track list. Results cached for 8 min to avoid slow yt-dlp on
   repeated queries from the homepage section loader.
   ─────────────────────────────────────────────────────────────────────── */
router.get("/music/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) { res.json([]); return; }

    const cached = getCached(q);
    if (cached) { res.json(cached); return; }

    let stdout = "";
    try {
      const result = await execFileAsync("yt-dlp", [
        "--flat-playlist", "--dump-json",
        ...BASE_FLAGS,
        `ytsearch10:${q}`,
      ], { timeout: 40000 });
      stdout = result.stdout;
    } catch (err: any) {
      stdout = err?.stdout ?? "";
      if (!stdout.trim()) { res.json([]); return; }
    }

    const tracks = stdout.trim().split("\n").filter(Boolean).flatMap(line => {
      try {
        const item = JSON.parse(line);
        const videoId: string = item.id ?? "";
        if (!videoId) return [];
        return [{
          videoId,
          title: item.title ?? "بدون عنوان",
          artist: item.uploader ?? item.channel ?? "فنان غير معروف",
          duration: fmtDuration(typeof item.duration === "number" ? item.duration : 0),
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          streamUrl: `/api/music/stream?id=${videoId}`,
        }];
      } catch { return []; }
    });

    setCache(q, tracks);
    res.json(tracks);
  } catch (err) { next(err); }
});

/* ── Resolve ─────────────────────────────────────────────────────────────
   Uses `yt-dlp -g` to get the direct YouTube CDN URL (~2-3 s).
   The browser can stream from that URL directly — no server-side piping.
   ─────────────────────────────────────────────────────────────────────── */
router.get("/music/resolve", async (req: Request, res: Response) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      "-g",
      "--format", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
      ...BASE_FLAGS,
      "--no-playlist",
      `https://www.youtube.com/watch?v=${id}`,
    ], { timeout: 20000 });

    const url = stdout.trim().split("\n")[0];
    if (!url) throw new Error("empty");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "private, max-age=1800"); // client cache 30 min
    res.json({ url });
  } catch {
    res.status(503).json({ message: "Could not resolve stream URL" });
  }
});

/* ── Stream (fallback) ──────────────────────────────────────────────────
   Used only if the frontend fails to resolve a direct URL.
   Sends raw audio (no transcoding) for speed.
   ─────────────────────────────────────────────────────────────────────── */
router.get("/music/stream", (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Accept-Ranges", "none");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const ytdlp = spawn("yt-dlp", [
    "-x", "--audio-format", "mp3", "--audio-quality", "3",
    "-o", "-",
    ...BASE_FLAGS,
    "--no-playlist", "--retries", "3", "--fragment-retries", "3",
    `https://www.youtube.com/watch?v=${id}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });

  ytdlp.stderr.on("data", () => {});
  ytdlp.on("error", err => { if (!res.headersSent) next(err); else if (!res.writableEnded) res.end(); });
  req.on("close", () => { try { ytdlp.kill("SIGKILL"); } catch {} });
  ytdlp.on("close", () => { if (!res.writableEnded) res.end(); });
  ytdlp.stdout.pipe(res, { end: true });
});

/* ── Download ────────────────────────────────────────────────────────────
   Resolves direct URL via yt-dlp -g then proxies the audio as a download.
   Fast: no transcoding, server just tunnels the YouTube CDN stream.
   ─────────────────────────────────────────────────────────────────────── */
router.get("/music/download", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  const safeTitle = rawTitle
    .replace(/[^\w\u0600-\u06FF\s\-().]/g, "").trim()
    .replace(/\s+/g, "_").slice(0, 120) || `track-${id}`;

  try {
    /* Step 1: get direct URL (fast - ~2-3 s) */
    const { stdout } = await execFileAsync("yt-dlp", [
      "-g",
      "--format", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
      ...BASE_FLAGS, "--no-playlist",
      `https://www.youtube.com/watch?v=${id}`,
    ], { timeout: 20000 });

    const directUrl = stdout.trim().split("\n")[0];
    if (!directUrl) throw new Error("No URL");

    /* Step 2: proxy the CDN stream as an attachment */
    const upstream = await fetch(directUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok || !upstream.body) throw new Error(`Upstream ${upstream.status}`);

    const mime = upstream.headers.get("Content-Type") || "audio/mp4";
    const ext = mime.includes("webm") ? "webm" : "m4a";
    const filename = `${safeTitle}.${ext}`;

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="audio.${ext}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (upstream.headers.has("Content-Length")) res.setHeader("Content-Length", upstream.headers.get("Content-Length")!);

    const stream = Readable.fromWeb(upstream.body as any);
    stream.pipe(res);
    req.on("close", () => stream.destroy());
  } catch (err) {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  }
});

export default router;
