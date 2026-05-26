/* Audio Player — 100% native <audio>, no YouTube iframe.
 * Online tracks: resolved via Cloudflare Worker → direct URL → <audio>
 * Local tracks:  blob URL directly → <audio>
 * Enables true background playback + Media Session lock-screen controls.
 */
import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { resolveStreamUrl } from "../lib/streamer";

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

function updateMediaSession(track: Track | null, playing: boolean) {
  if (!("mediaSession" in navigator)) return;
  if (!track) { navigator.mediaSession.metadata = null; return; }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: "seifoo",
    artwork: track.thumbnail
      ? [
          { src: track.thumbnail, sizes: "480x480", type: "image/jpeg" },
          { src: track.thumbnail, sizes: "512x512", type: "image/jpeg" },
        ]
      : [{ src: "/logo.png", sizes: "512x512", type: "image/png" }],
  });
  navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

function updatePositionState(currentTime: number, duration: number) {
  if (!("mediaSession" in navigator)) return;
  if (!isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState?.({ duration, playbackRate: 1, position: Math.min(currentTime, duration) });
  } catch {}
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [status, setStatus] = useState<Status>({ playing: false, currentTime: 0, duration: 0, isBuffering: false });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentIdxRef = useRef(0);
  const queueRef = useRef<Track[]>([]);
  const currentTrackRef = useRef<Track | null>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  const getAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
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
    audio.addEventListener("waiting", () => setStatus(s => ({ ...s, isBuffering: true })));
    audio.addEventListener("playing", () => setStatus(s => ({ ...s, isBuffering: false })));
    audio.addEventListener("canplay", () => setStatus(s => ({ ...s, isBuffering: false })));
    audio.addEventListener("timeupdate", () => {
      const a = audioRef.current; if (!a) return;
      const ct = a.currentTime;
      const dur = isFinite(a.duration) ? a.duration : 0;
      setStatus(s => ({ ...s, currentTime: ct, duration: dur }));
      updatePositionState(ct, dur);
    });
    audio.addEventListener("durationchange", () => {
      const a = audioRef.current; if (!a) return;
      const dur = isFinite(a.duration) ? a.duration : 0;
      setStatus(s => ({ ...s, duration: dur }));
    });
    audio.addEventListener("ended", () => {
      const next = currentIdxRef.current + 1;
      const q = queueRef.current;
      if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
      else { setStatus(s => ({ ...s, playing: false })); updateMediaSession(currentTrackRef.current, false); }
    });
    audio.addEventListener("error", (e) => {
      console.error("[player] audio error", e);
      setStatus(s => ({ ...s, isBuffering: false, playing: false }));
    });

    audioRef.current = audio;
    return audio;
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => getAudio().play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => getAudio().pause());
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
      if (d.seekTime === undefined) return;
      const a = audioRef.current; if (a) a.currentTime = d.seekTime;
    });
    navigator.mediaSession.setActionHandler("seekbackward", d => {
      const a = audioRef.current; if (a) a.currentTime = Math.max(0, a.currentTime - (d.seekOffset ?? 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", d => {
      const a = audioRef.current; if (a) a.currentTime = Math.min(a.duration || 0, a.currentTime + (d.seekOffset ?? 10));
    });
  }, [getAudio]);

  async function loadAndPlay(track: Track) {
    resolveAbortRef.current?.abort();
    const ctrl = new AbortController();
    resolveAbortRef.current = ctrl;

    setCurrentTrack(track);
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: true });
    updateMediaSession(track, false);

    const audio = getAudio();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    try {
      let src: string;
      if (track.localUrl) {
        src = track.localUrl;
      } else {
        const { url } = await resolveStreamUrl(track.videoId);
        if (ctrl.signal.aborted) return;
        src = url;
      }
      audio.src = src;
      audio.load();
      await audio.play();
    } catch (e: any) {
      if (ctrl.signal.aborted) return;
      console.error("[player] playback error:", e);
      setStatus(s => ({ ...s, isBuffering: false, playing: false }));
    }
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
    const a = audioRef.current; if (!a) return;
    if (status.playing) a.pause();
    else a.play().catch(() => {});
  }

  function playNext() {
    const next = currentIdxRef.current + 1;
    const q = queueRef.current;
    if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
  }

  function playPrev() {
    const a = audioRef.current;
    if (a && a.currentTime > 3) { a.currentTime = 0; return; }
    const prev = currentIdxRef.current - 1;
    const q = queueRef.current;
    if (prev >= 0) { currentIdxRef.current = prev; loadAndPlay(q[prev]); }
  }

  function seekTo(seconds: number) {
    const a = audioRef.current;
    if (!a || !isFinite(seconds)) return;
    a.currentTime = Math.max(0, seconds);
    updatePositionState(seconds, a.duration || 0);
  }

  function clearPlayer() {
    resolveAbortRef.current?.abort();
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    setCurrentTrack(null);
    setQueue([]);
    queueRef.current = [];
    currentIdxRef.current = 0;
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
