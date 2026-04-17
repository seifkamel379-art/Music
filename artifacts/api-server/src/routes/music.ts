import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import playdl from "play-dl";
import yts from "yt-search";
import { z } from "zod/v4";
import { db, musicFavoritesTable, musicPlayerStateTable, musicPlaylistTable } from "@workspace/db";

const router: IRouter = Router();
const PASSWORD = "80808016";

const cookie = process.env.YOUTUBE_COOKIES;
if (cookie) {
  playdl.setToken({ youtube: { cookie } } as never);
}

const addTrackSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  duration: z.string().min(1),
  thumbnail: z.string().nullable().optional(),
  addedBy: z.string().min(1),
});

const loginSchema = z.object({
  name: z.string().trim().min(1),
  password: z.string(),
});

const playerSchema = z.object({
  currentVideoId: z.string().nullable().optional(),
  isPlaying: z.boolean(),
  updatedBy: z.string().optional(),
});

function streamUrl(videoId: string) {
  return `/api/music/stream/${encodeURIComponent(videoId)}`;
}

function cleanText(value: string | undefined | null, fallback: string) {
  const text = value?.trim();
  return text && text.length > 0 ? text : fallback;
}

function rowToTrack(row: typeof musicPlaylistTable.$inferSelect, favoriteIds: Set<string>) {
  return {
    videoId: row.videoId,
    title: row.title,
    artist: row.artist,
    duration: row.duration,
    thumbnail: row.thumbnail,
    addedBy: row.addedBy,
    addedAt: row.createdAt.toISOString(),
    isFavorite: favoriteIds.has(row.videoId),
    streamUrl: streamUrl(row.videoId),
  };
}

function favoriteToTrack(row: typeof musicFavoritesTable.$inferSelect) {
  return {
    videoId: row.videoId,
    title: row.title,
    artist: row.artist,
    duration: row.duration,
    thumbnail: row.thumbnail,
    createdAt: row.createdAt.toISOString(),
    streamUrl: streamUrl(row.videoId),
  };
}

async function searchMusic(q: string) {
  try {
    const results = await playdl.search(q, {
      limit: 18,
      source: { youtube: "video" },
    });

    return results
      .filter((item) => item.id)
      .map((item) => ({
        videoId: item.id ?? "",
        title: cleanText(item.title, "Untitled track"),
        artist: cleanText(item.channel?.name, "Unknown artist"),
        duration: cleanText(item.durationRaw, "0:00"),
        thumbnail: item.thumbnails?.[item.thumbnails.length - 1]?.url ?? null,
        streamUrl: streamUrl(item.id ?? ""),
      }));
  } catch {
    const fallback = await yts(q);
    return fallback.videos.slice(0, 18).map((item) => ({
      videoId: item.videoId,
      title: cleanText(item.title, "Untitled track"),
      artist: cleanText(item.author.name, "Unknown artist"),
      duration: cleanText(item.timestamp, "0:00"),
      thumbnail: item.thumbnail || null,
      streamUrl: streamUrl(item.videoId),
    }));
  }
}

async function getAudioStream(videoId: string) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  try {
    const info = await playdl.video_basic_info(watchUrl);
    return await playdl.stream_from_info(info, { quality: 2 });
  } catch (firstError) {
    try {
      return await playdl.stream(watchUrl, { quality: 2 });
    } catch (secondError) {
      throw new Error(
        `Audio stream unavailable. Add YOUTUBE_COOKIES in Secrets if bot protection is blocking playback. First: ${firstError instanceof Error ? firstError.message : "unknown"}. Second: ${secondError instanceof Error ? secondError.message : "unknown"}`,
      );
    }
  }
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

router.get("/music/playlist", async (_req, res, next) => {
  try {
    const [playlist, favorites] = await Promise.all([
      db.select().from(musicPlaylistTable).orderBy(asc(musicPlaylistTable.id)),
      db.select({ videoId: musicFavoritesTable.videoId }).from(musicFavoritesTable),
    ]);
    const favoriteIds = new Set(favorites.map((item) => item.videoId));
    res.json({ tracks: playlist.map((track) => rowToTrack(track, favoriteIds)) });
  } catch (error) {
    next(error);
  }
});

router.post("/music/playlist", async (req, res, next) => {
  try {
    const parsed = addTrackSchema.parse(req.body);
    const [track] = await db
      .insert(musicPlaylistTable)
      .values({
        videoId: parsed.videoId,
        title: parsed.title,
        artist: parsed.artist,
        duration: parsed.duration,
        thumbnail: parsed.thumbnail ?? null,
        addedBy: parsed.addedBy,
      })
      .onConflictDoUpdate({
        target: musicPlaylistTable.videoId,
        set: {
          title: parsed.title,
          artist: parsed.artist,
          duration: parsed.duration,
          thumbnail: parsed.thumbnail ?? null,
          addedBy: parsed.addedBy,
        },
      })
      .returning();

    const favorites = await db
      .select({ videoId: musicFavoritesTable.videoId })
      .from(musicFavoritesTable)
      .where(eq(musicFavoritesTable.videoId, parsed.videoId));

    res.json(rowToTrack(track, new Set(favorites.map((item) => item.videoId))));
  } catch (error) {
    next(error);
  }
});

router.delete("/music/playlist/:videoId", async (req, res, next) => {
  try {
    await db.delete(musicPlaylistTable).where(eq(musicPlaylistTable.videoId, req.params.videoId));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/music/favorites", async (_req, res, next) => {
  try {
    const favorites = await db.select().from(musicFavoritesTable).orderBy(desc(musicFavoritesTable.createdAt));
    res.json({ tracks: favorites.map(favoriteToTrack) });
  } catch (error) {
    next(error);
  }
});

router.post("/music/favorites/:videoId", async (req, res, next) => {
  try {
    const parsed = addTrackSchema.parse({ ...req.body, videoId: req.params.videoId });
    const existing = await db
      .select({ videoId: musicFavoritesTable.videoId })
      .from(musicFavoritesTable)
      .where(eq(musicFavoritesTable.videoId, parsed.videoId));

    if (existing.length > 0) {
      await db.delete(musicFavoritesTable).where(eq(musicFavoritesTable.videoId, parsed.videoId));
      res.json({ isFavorite: false });
      return;
    }

    await db.insert(musicFavoritesTable).values({
      videoId: parsed.videoId,
      title: parsed.title,
      artist: parsed.artist,
      duration: parsed.duration,
      thumbnail: parsed.thumbnail ?? null,
    });

    res.json({ isFavorite: true });
  } catch (error) {
    next(error);
  }
});

router.get("/music/player", async (_req, res, next) => {
  try {
    const [state] = await db.select().from(musicPlayerStateTable).where(eq(musicPlayerStateTable.id, 1));
    const currentVideoId = state?.currentVideoId ?? null;
    res.json({
      currentVideoId,
      isPlaying: state?.isPlaying ?? false,
      updatedBy: state?.updatedBy ?? null,
      updatedAt: (state?.updatedAt ?? new Date()).toISOString(),
      streamUrl: currentVideoId ? streamUrl(currentVideoId) : null,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/music/player", async (req, res, next) => {
  try {
    const parsed = playerSchema.parse(req.body);
    const [state] = await db
      .insert(musicPlayerStateTable)
      .values({
        id: 1,
        currentVideoId: parsed.currentVideoId ?? null,
        isPlaying: parsed.isPlaying,
        updatedBy: parsed.updatedBy ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: musicPlayerStateTable.id,
        set: {
          currentVideoId: parsed.currentVideoId ?? null,
          isPlaying: parsed.isPlaying,
          updatedBy: parsed.updatedBy ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json({
      currentVideoId: state.currentVideoId,
      isPlaying: state.isPlaying,
      updatedBy: state.updatedBy,
      updatedAt: state.updatedAt.toISOString(),
      streamUrl: state.currentVideoId ? streamUrl(state.currentVideoId) : null,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/music/stream/:videoId", async (req, res, next) => {
  try {
    const stream = await getAudioStream(req.params.videoId);
    res.setHeader("Content-Type", stream.type.includes("webm") ? "audio/webm" : "audio/mp4");
    res.setHeader("Cache-Control", "private, max-age=900");
    if (req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename=\"seif-music-${req.params.videoId}.mp3\"`);
    }
    stream.stream.pipe(res);
  } catch (error) {
    req.log.error({ err: error, videoId: req.params.videoId }, "Music stream failed");
    res.status(503).json({ message: error instanceof Error ? error.message : "Audio stream unavailable" });
  }
});

export default router;
