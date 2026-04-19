import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "child_process";
import { promisify } from "util";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();
const PASSWORD = "16168080";
const execFileAsync = promisify(execFile);

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

const BASE = [
  "--no-warnings", "--no-check-certificate", "--geo-bypass", "--socket-timeout", "10",
];

function fmtDuration(s: number) {
  const n = Math.floor(s);
  return `${Math.floor(n / 60)}:${(n % 60).toString().padStart(2, "0")}`;
}

/* ── Login ──────────────────────────────────────────────────────────────── */
router.post("/music/login", (req, res) => {
  const p = z.object({ name: z.string().trim().min(1), password: z.string() }).safeParse(req.body);
  if (!p.success || p.data.password !== PASSWORD) { res.status(401).json({ message: "Wrong password" }); return; }
  res.json({ ok: true, name: p.data.name });
});

/* ── Search ─────────────────────────────────────────────────────────────── */
router.get("/music/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) { res.json([]); return; }
    const cached = getCached(q);
    if (cached) { res.json(cached); return; }

    let stdout = "";
    try {
      ({ stdout } = await execFileAsync("yt-dlp", [
        "--flat-playlist", "--dump-json", ...BASE,
        `ytsearch15:${q}`,
      ], { timeout: 40000 }));
    } catch (e: any) {
      stdout = e?.stdout ?? "";
      if (!stdout.trim()) { res.json([]); return; }
    }

    const tracks = stdout.trim().split("\n").filter(Boolean).flatMap(line => {
      try {
        const item = JSON.parse(line);
        const videoId: string = item.id ?? "";
        if (!videoId) return [];
        return [{ videoId, title: item.title ?? "بدون عنوان", artist: item.uploader ?? item.channel ?? "فنان", duration: fmtDuration(typeof item.duration === "number" ? item.duration : 0), thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, streamUrl: `/api/music/stream?id=${videoId}` }];
      } catch { return []; }
    });

    setCache(q, tracks);
    res.json(tracks);
  } catch (e) { next(e); }
});

function createYtDlpAudioProcess(videoId: string): ChildProcessWithoutNullStreams {
  return spawn("yt-dlp", [
    "-f", "bestaudio",
    "-o", "-",
    ...BASE,
    "--no-playlist",
    `https://www.youtube.com/watch?v=${videoId}`,
  ], { stdio: ["pipe", "pipe", "pipe"] });
}

function streamMp3(req: Request, res: Response, videoId: string, bitrate: "128k" | "192k", onHeaders: () => void, next: NextFunction) {
  const ytdlp = createYtDlpAudioProcess(videoId);
  const ff = spawn("ffmpeg", [
    "-i", "pipe:0",
    "-vn", "-ar", "44100", "-ac", "2", "-b:a", bitrate,
    "-f", "mp3", "-",
  ], { stdio: ["pipe", "pipe", "pipe"] });

  ytdlp.stdout.pipe(ff.stdin);
  ytdlp.stderr.on("data", () => {});
  ff.stderr.on("data", () => {});
  ytdlp.on("error", e => { if (!res.headersSent) next(e); else if (!res.writableEnded) res.end(); });
  ff.on("error", e => { if (!res.headersSent) next(e); else if (!res.writableEnded) res.end(); });
  ff.stdin.on("error", () => {});

  let sentAudio = false;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    try { ytdlp.kill("SIGKILL"); } catch {}
    try { ff.kill("SIGKILL"); } catch {}
  };

  req.on("close", cleanup);
  ff.stdout.on("data", chunk => {
    if (!sentAudio) {
      sentAudio = true;
      onHeaders();
    }
    res.write(chunk);
  });
  ff.stdout.on("end", () => {
    if (!res.writableEnded) res.end();
  });
  ff.on("close", () => {
    if (!sentAudio && !res.headersSent) {
      res.status(502).json({ message: "Audio conversion failed" });
      return;
    }
    if (!res.writableEnded) res.end();
  });
}

router.get("/music/stream", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  streamMp3(req, res, id, "128k", () => {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.setHeader("Accept-Ranges", "none");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }, next);
});

/* ── Download ───────────────────────────────────────────────────────────────
   Same as stream but with Content-Disposition: attachment.
   Frontend opens URL directly → browser shows native download bar.
   ─────────────────────────────────────────────────────────────────────────── */
router.get("/music/download", async (req: Request, res: Response, next: NextFunction) => {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  const rawTitle = typeof req.query.title === "string" ? req.query.title.trim() : "track";
  if (!id) { res.status(400).json({ message: "Missing id" }); return; }

  const safeTitle = rawTitle
    .replace(/[^\w\u0600-\u06FF\s\-().]/g, "").trim()
    .replace(/\s+/g, "_").slice(0, 120) || `track-${id}`;
  const filename = `${safeTitle}.mp3`;

  streamMp3(req, res, id, "192k", () => {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="track.mp3"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }, next);
});

export default router;
