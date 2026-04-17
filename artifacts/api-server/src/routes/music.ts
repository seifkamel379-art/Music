import { type Readable } from "node:stream";
import { Router, type IRouter } from "express";
import ytdl from "@distube/ytdl-core";
import yts from "yt-search";
import { z } from "zod/v4";
import { YOUTUBE_COOKIES, YOUTUBE_COOKIE_STRING } from "../secrets.js";

const router: IRouter = Router();
const PASSWORD = "80808016";

const rawCookie = process.env.YOUTUBE_COOKIES || YOUTUBE_COOKIE_STRING;
const rawCookieObjects = process.env.YOUTUBE_COOKIES
  ? process.env.YOUTUBE_COOKIES.split(";").map((part) => {
      const [name, ...rest] = part.trim().split("=");
      return { name: name.trim(), value: rest.join("="), domain: ".youtube.com", path: "/", secure: true, expires: 9999999999 };
    })
  : YOUTUBE_COOKIES;

const agent = ytdl.createAgent(rawCookieObjects);

const loginSchema = z.object({
  name: z.string().trim().min(1),
  password: z.string(),
});

function streamUrl(videoId: string) {
  return `/api/music/stream/${encodeURIComponent(videoId)}`;
}

function cleanText(value: string | undefined | null, fallback: string) {
  const text = value?.trim();
  return text && text.length > 0 ? text : fallback;
}

async function searchMusic(q: string) {
  try {
    const fallback = await yts(q);
    return fallback.videos.slice(0, 18).map((item) => ({
      videoId: item.videoId,
      title: cleanText(item.title, "Untitled track"),
      artist: cleanText(item.author.name, "Unknown artist"),
      duration: cleanText(item.timestamp, "0:00"),
      thumbnail: item.thumbnail || null,
      streamUrl: streamUrl(item.videoId),
    }));
  } catch (error) {
    throw new Error(`Search failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

async function getAudioStream(videoId: string): Promise<{ stream: Readable; contentType: string }> {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const info = await ytdl.getInfo(watchUrl, { agent });
  const formats = ytdl.filterFormats(info.formats, "audioonly");
  const bestFormat = formats.sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0))[0];
  if (!bestFormat) throw new Error("No audio format available");
  const stream = ytdl.downloadFromInfo(info, { format: bestFormat, agent });
  const mime = bestFormat.mimeType ?? "audio/mp4";
  const contentType = mime.split(";")[0];
  return { stream, contentType };
}

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
    if (!q) {
      res.json({ tracks: [] });
      return;
    }
    res.json({ tracks: await searchMusic(q) });
  } catch (error) {
    next(error);
  }
});

router.get("/music/stream/:videoId", async (req, res, next) => {
  try {
    const { stream, contentType } = await getAudioStream(req.params.videoId);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=900");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.query.download === "1") {
      const rawTitle = typeof req.query.title === "string" ? req.query.title : `track-${req.params.videoId}`;
      const safeTitle = rawTitle.replace(/[^\w\u0600-\u06FF\s\-]/g, "").trim().replace(/\s+/g, "_") || `track-${req.params.videoId}`;
      res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.mp3"`);
    }
    stream.pipe(res);
    stream.on("error", (err) => {
      req.log.error({ err }, "Stream pipe error");
      if (!res.headersSent) res.status(503).json({ message: "Stream interrupted" });
    });
  } catch (error) {
    req.log.error({ err: error, videoId: req.params.videoId }, "Music stream failed");
    if (!res.headersSent) {
      res.status(503).json({ message: error instanceof Error ? error.message : "Audio stream unavailable" });
    }
    next(error);
  }
});

export default router;
