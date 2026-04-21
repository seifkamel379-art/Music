import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";

export type Track = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  localUrl?: string;
};

type Status = {
  playing: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
};

type AudioPlayerCtx = {
  currentTrack: Track | null;
  queue: Track[];
  status: Status;
  playTrack: (track: Track, queue?: Track[]) => void;
  pauseOrResume: () => void;
  playNext: () => void;
  playPrev: () => void;
  seekTo: (seconds: number) => void;
  clearPlayer: () => void;
};

const Ctx = createContext<AudioPlayerCtx | null>(null);

/* ── Media Session helper ─────────────────────────────────────────────────── */
function updateMediaSession(track: Track | null, playing: boolean) {
  if (!("mediaSession" in navigator)) return;
  if (!track) { navigator.mediaSession.metadata = null; return; }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: "music&sk",
    artwork: track.thumbnail
      ? [
          { src: track.thumbnail, sizes: "480x480", type: "image/jpeg" },
          { src: track.thumbnail, sizes: "512x512", type: "image/jpeg" },
        ]
      : [{ src: "/logo.png", sizes: "192x192", type: "image/png" }],
  });
  navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

/* ── Audio URL resolution ─────────────────────────────────────────────────── */
const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined;
const WORKER_KEY = import.meta.env.VITE_WORKER_AUTH_KEY as string | undefined;

const urlCache = new Map<string, { url: string; ts: number }>();
const URL_TTL = 3 * 60 * 60 * 1000; // 3 hours

function getCached(videoId: string): string | null {
  const c = urlCache.get(videoId);
  return c && Date.now() - c.ts < URL_TTL ? c.url : null;
}
function setCached(videoId: string, url: string) {
  urlCache.set(videoId, { url, ts: Date.now() });
}

async function resolveViaWorker(videoId: string): Promise<string | null> {
  if (!WORKER_URL) return null;
  try {
    const url = new URL(`${WORKER_URL}/url`);
    url.searchParams.set("id", videoId);
    if (WORKER_KEY) url.searchParams.set("key", WORKER_KEY);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json() as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

async function resolveViaApi(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/music/url?id=${encodeURIComponent(videoId)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

async function resolveAudioUrl(videoId: string): Promise<string> {
  const cached = getCached(videoId);
  if (cached) return cached;

  const workerUrl = await resolveViaWorker(videoId);
  if (workerUrl) {
    setCached(videoId, workerUrl);
    console.log("[player] using Worker URL for", videoId);
    return workerUrl;
  }

  const apiUrl = await resolveViaApi(videoId);
  if (apiUrl) {
    setCached(videoId, apiUrl);
    console.log("[player] using API URL for", videoId);
    return apiUrl;
  }

  console.warn("[player] falling back to stream proxy for", videoId);
  return `/api/music/stream?id=${encodeURIComponent(videoId)}`;
}

/* ── Provider ─────────────────────────────────────────────────────────────── */
export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [status, setStatus] = useState<Status>({
    playing: false, currentTime: 0, duration: 0, isBuffering: false,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentIdxRef = useRef(0);
  const queueRef = useRef<Track[]>([]);
  const currentTrackRef = useRef<Track | null>(null);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";

      audio.addEventListener("play", () => {
        setStatus(s => ({ ...s, playing: true, isBuffering: false }));
        updateMediaSession(currentTrackRef.current, true);
      });
      audio.addEventListener("pause", () => {
        setStatus(s => ({ ...s, playing: false }));
        updateMediaSession(currentTrackRef.current, false);
      });
      audio.addEventListener("waiting", () => {
        setStatus(s => ({ ...s, isBuffering: true }));
      });
      audio.addEventListener("canplay", () => {
        setStatus(s => ({ ...s, isBuffering: false }));
      });
      audio.addEventListener("timeupdate", () => {
        const a = audioRef.current;
        if (!a) return;
        setStatus(s => ({ ...s, currentTime: a.currentTime }));
        if ("mediaSession" in navigator && isFinite(a.duration) && a.duration > 0) {
          try {
            navigator.mediaSession.setPositionState?.({
              duration: a.duration, playbackRate: 1, position: a.currentTime,
            });
          } catch {}
        }
      });
      audio.addEventListener("durationchange", () => {
        const a = audioRef.current;
        if (!a) return;
        setStatus(s => ({ ...s, duration: isFinite(a.duration) ? a.duration : 0 }));
      });
      audio.addEventListener("ended", () => {
        const next = currentIdxRef.current + 1;
        const q = queueRef.current;
        if (next < q.length) {
          currentIdxRef.current = next;
          loadAndPlay(q[next]);
        } else {
          setStatus(s => ({ ...s, playing: false }));
          updateMediaSession(currentTrackRef.current, false);
        }
      });
      audio.addEventListener("error", () => {
        setStatus(s => ({ ...s, isBuffering: false, playing: false }));
        updateMediaSession(currentTrackRef.current, false);
      });

      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => {
      audioRef.current?.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const next = currentIdxRef.current + 1;
      const q = queueRef.current;
      if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      const a = audioRef.current;
      if (a && a.currentTime > 3) { a.currentTime = 0; return; }
      const prev = currentIdxRef.current - 1;
      const q = queueRef.current;
      if (prev >= 0) { currentIdxRef.current = prev; loadAndPlay(q[prev]); }
    });
    navigator.mediaSession.setActionHandler("seekto", d => {
      if (d.seekTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = d.seekTime;
      }
    });
  }, []);

  function loadAndPlay(track: Track) {
    const audio = getAudio();
    audio.pause();
    audio.src = "";
    audio.load();

    setCurrentTrack(track);
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: true });
    updateMediaSession(track, false);

    if (track.localUrl) {
      audio.src = track.localUrl;
      audio.load();
      audio.play().catch(e => {
        console.error("[player] local playback error:", e);
        setStatus(s => ({ ...s, isBuffering: false, playing: false }));
      });
      return;
    }

    resolveAudioUrl(track.videoId).then(src => {
      if (currentTrackRef.current?.videoId !== track.videoId) return;
      audio.src = src;
      audio.load();
      audio.play().catch(e => {
        console.error("[player] playback error:", e);
        setStatus(s => ({ ...s, isBuffering: false, playing: false }));
      });
    });
  }

  function playTrack(track: Track, newQueue?: Track[]) {
    if (newQueue) {
      const idx = Math.max(0, newQueue.findIndex(t => t.videoId === track.videoId));
      currentIdxRef.current = idx;
      setQueue(newQueue);
      queueRef.current = newQueue;
    } else {
      const idx = Math.max(0, queueRef.current.findIndex(t => t.videoId === track.videoId));
      currentIdxRef.current = idx;
    }
    loadAndPlay(track);
  }

  function pauseOrResume() {
    const audio = audioRef.current;
    if (!audio) return;
    if (status.playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }

  function playNext() {
    const next = currentIdxRef.current + 1;
    const q = queueRef.current;
    if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
  }

  function playPrev() {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    const prev = currentIdxRef.current - 1;
    const q = queueRef.current;
    if (prev >= 0) { currentIdxRef.current = prev; loadAndPlay(q[prev]); }
  }

  function seekTo(seconds: number) {
    if (!isFinite(seconds) || seconds < 0) return;
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seconds;
      if ("mediaSession" in navigator && status.duration > 0) {
        try {
          navigator.mediaSession.setPositionState?.({
            duration: status.duration, playbackRate: 1, position: seconds,
          });
        } catch {}
      }
    }
  }

  function clearPlayer() {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    setCurrentTrack(null);
    setQueue([]);
    queueRef.current = [];
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: false });
    updateMediaSession(null, false);
  }

  const value = useMemo<AudioPlayerCtx>(() => ({
    currentTrack, queue, status,
    playTrack, pauseOrResume, playNext, playPrev, seekTo, clearPlayer,
  }), [currentTrack, queue, status]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudioPlayer() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAudioPlayer must be inside AudioPlayerProvider");
  return v;
}
