import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import yts from "yt-search";
import { z } from "zod/v4";

const router: IRouter = Router();
const PASSWORD = "80808016";

const YTDLP = "python3.11";
const YTDLP_ARGS = ["-m", "yt_dlp"];

function streamUrl(videoId: string) {
  return `/api/music/stream/${encodeURIComponent(videoId)}`;
}

function cleanText(value: string | undefined | null, fallback: string) {
  const text = value?.trim();
  return text && text.length > 0 ? text : fallback;
}

function safeDownloadName(rawTitle: string, videoId: string) {
  return rawTitle
    .replace(/[^\w\u0600-\u06FF\s\-().]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120) || `track-${videoId}`;
}

async function searchMusic(q: string) {
  const res = await yts(q);
  return res.videos.slice(0, 18).map((item) => ({
    videoId: item.videoId,
    title: cleanText(item.title, "Untitled track"),
    artist: cleanText(item.author.name, "Unknown artist"),
    duration: cleanText(item.timestamp, "0:00"),
    thumbnail: item.thumbnail || null,
    streamUrl: streamUrl(item.videoId),
  }));
}

function getYtdlpUrl(videoId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, [
      ...YTDLP_ARGS,
      "--get-url",
      "--format",
      "bestaudio",
      "--no-playlist",
      "--quiet",
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });
    proc.on("close", (code) => {
      const url = stdout.trim().split("\n").find((l) => l.startsWith("http"));
      if (url) resolve(url);
      else reject(new Error(`yt-dlp failed (code ${code}): ${stderr.slice(0, 200)}`));
    });
    proc.on("error", reject);
  });
}

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
    if (!q) { res.json({ tracks: [] }); return; }
    res.json({ tracks: await searchMusic(q) });
  } catch (error) {
    next(error);
  }
});

router.get("/music/url/:videoId", async (req, res, next) => {
  try {
    const url = await getYtdlpUrl(req.params.videoId);
    res.json({ url });
  } catch (error) {
    next(error);
  }
});

router.get("/music/stream/:videoId", async (req, res, next) => {
  const { videoId } = req.params;
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

    const isDownload = req.query.download === "1";
    const rawTitle = typeof req.query.title === "string" ? req.query.title : `track-${videoId}`;
    const safeTitle = safeDownloadName(rawTitle, videoId);
    const asciiFallback = safeTitle.replace(/[^\x20-\x7E]/g, "").trim().replace(/\s+/g, "_") || `track-${videoId}`;

    const ytProc = spawn(YTDLP, [
      ...YTDLP_ARGS,
      "--format",
      "bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio",
      "--no-playlist",
      "--quiet",
      "--no-part",
      "-o",
      "-",
      watchUrl,
    ]);

    res.setHeader("Content-Type", "audio/mp4");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Transfer-Encoding", "chunked");

    if (isDownload) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiFallback}.m4a"; filename*=UTF-8''${encodeURIComponent(`${safeTitle}.m4a`)}`
      );
    }

    let headersSent = false;
    ytProc.stdout.on("data", (chunk: Buffer) => {
      if (!res.writableEnded) {
        if (!headersSent) headersSent = true;
        res.write(chunk);
      }
    });

    ytProc.stdout.on("end", () => {
      if (!res.writableEnded) res.end();
    });

    ytProc.on("error", (err) => {
      if (!res.headersSent) {
        res.status(503).json({ message: "Stream process error" });
      } else if (!res.writableEnded) {
        res.end();
      }
    });

    ytProc.on("close", (code) => {
      if (code !== 0 && !res.headersSent) {
        res.status(503).json({ message: "Audio extraction failed" });
      } else if (!res.writableEnded) {
        res.end();
      }
    });

    req.on("close", () => {
      try { ytProc.kill("SIGTERM"); } catch {}
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(503).json({ message: "Stream unavailable" });
    }
    next(error);
  }
});

export default router;
