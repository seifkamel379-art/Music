import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { ytPlayer } from "../lib/youtube-iframe";

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

/* ── Provider ─────────────────────────────────────────────────────────────── */
export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [status, setStatus] = useState<Status>({
    playing: false, currentTime: 0, duration: 0, isBuffering: false,
  });

  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentIdxRef = useRef(0);
  const queueRef = useRef<Track[]>([]);
  const currentTrackRef = useRef<Track | null>(null);
  const usingLocalRef = useRef(false);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  /* ── Local file <audio> element (only used for device tracks) ──────────── */
  const getLocalAudio = useCallback((): HTMLAudioElement => {
    if (!localAudioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";

      audio.addEventListener("play", () => {
        if (!usingLocalRef.current) return;
        setStatus(s => ({ ...s, playing: true, isBuffering: false }));
        updateMediaSession(currentTrackRef.current, true);
      });
      audio.addEventListener("pause", () => {
        if (!usingLocalRef.current) return;
        setStatus(s => ({ ...s, playing: false }));
        updateMediaSession(currentTrackRef.current, false);
      });
      audio.addEventListener("waiting", () => {
        if (!usingLocalRef.current) return;
        setStatus(s => ({ ...s, isBuffering: true }));
      });
      audio.addEventListener("canplay", () => {
        if (!usingLocalRef.current) return;
        setStatus(s => ({ ...s, isBuffering: false }));
      });
      audio.addEventListener("timeupdate", () => {
        if (!usingLocalRef.current) return;
        const a = localAudioRef.current;
        if (!a) return;
        setStatus(s => ({ ...s, currentTime: a.currentTime }));
      });
      audio.addEventListener("durationchange", () => {
        if (!usingLocalRef.current) return;
        const a = localAudioRef.current;
        if (!a) return;
        setStatus(s => ({ ...s, duration: isFinite(a.duration) ? a.duration : 0 }));
      });
      audio.addEventListener("ended", () => {
        if (!usingLocalRef.current) return;
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
        if (!usingLocalRef.current) return;
        setStatus(s => ({ ...s, isBuffering: false, playing: false }));
        updateMediaSession(currentTrackRef.current, false);
      });

      localAudioRef.current = audio;
    }
    return localAudioRef.current;
  }, []);

  /* ── YouTube iframe events ─────────────────────────────────────────────── */
  useEffect(() => {
    const offState = ytPlayer.on("stateChange", (s) => {
      if (usingLocalRef.current) return;
      if (s === "playing") {
        setStatus(st => ({ ...st, playing: true, isBuffering: false }));
        updateMediaSession(currentTrackRef.current, true);
      } else if (s === "paused") {
        setStatus(st => ({ ...st, playing: false }));
        updateMediaSession(currentTrackRef.current, false);
      } else if (s === "buffering") {
        setStatus(st => ({ ...st, isBuffering: true }));
      } else if (s === "ended") {
        const next = currentIdxRef.current + 1;
        const q = queueRef.current;
        if (next < q.length) {
          currentIdxRef.current = next;
          loadAndPlay(q[next]);
        } else {
          setStatus(st => ({ ...st, playing: false }));
          updateMediaSession(currentTrackRef.current, false);
        }
      } else if (s === "error") {
        setStatus(st => ({ ...st, playing: false, isBuffering: false }));
      }
    });

    const offTime = ytPlayer.on("timeUpdate", ({ currentTime, duration }) => {
      if (usingLocalRef.current) return;
      setStatus(st => ({ ...st, currentTime, duration }));
      if ("mediaSession" in navigator && duration > 0) {
        try {
          navigator.mediaSession.setPositionState?.({
            duration, playbackRate: 1, position: currentTime,
          });
        } catch {}
      }
    });

    const offErr = ytPlayer.on("error", (msg) => {
      console.error("[player] yt error:", msg);
    });

    return () => { offState(); offTime(); offErr(); };
  }, []);

  /* ── Media Session controls ────────────────────────────────────────────── */
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => {
      if (usingLocalRef.current) localAudioRef.current?.play().catch(() => {});
      else ytPlayer.resume();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (usingLocalRef.current) localAudioRef.current?.pause();
      else ytPlayer.pause();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const next = currentIdxRef.current + 1;
      const q = queueRef.current;
      if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      if (usingLocalRef.current) {
        const a = localAudioRef.current;
        if (a && a.currentTime > 3) { a.currentTime = 0; return; }
      } else if (ytPlayer.getCurrentTime() > 3) {
        ytPlayer.seekTo(0);
        return;
      }
      const prev = currentIdxRef.current - 1;
      const q = queueRef.current;
      if (prev >= 0) { currentIdxRef.current = prev; loadAndPlay(q[prev]); }
    });
    navigator.mediaSession.setActionHandler("seekto", d => {
      if (d.seekTime === undefined) return;
      if (usingLocalRef.current && localAudioRef.current) {
        localAudioRef.current.currentTime = d.seekTime;
      } else {
        ytPlayer.seekTo(d.seekTime);
      }
    });
  }, []);

  function loadAndPlay(track: Track) {
    setCurrentTrack(track);
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: true });
    updateMediaSession(track, false);

    if (track.localUrl) {
      // Stop any YT playback and use local <audio>
      try { ytPlayer.stop(); } catch {}
      usingLocalRef.current = true;
      const audio = getLocalAudio();
      audio.pause();
      audio.src = track.localUrl;
      audio.load();
      audio.play().catch(e => {
        console.error("[player] local playback error:", e);
        setStatus(s => ({ ...s, isBuffering: false, playing: false }));
      });
      return;
    }

    // Stop any local audio and use hidden YouTube iframe
    if (localAudioRef.current) {
      try { localAudioRef.current.pause(); localAudioRef.current.src = ""; } catch {}
    }
    usingLocalRef.current = false;

    ytPlayer.play(track.videoId).catch(e => {
      console.error("[player] yt playback error:", e);
      setStatus(s => ({ ...s, isBuffering: false, playing: false }));
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
    if (usingLocalRef.current) {
      const a = localAudioRef.current;
      if (!a) return;
      if (status.playing) a.pause();
      else a.play().catch(() => {});
    } else {
      if (status.playing) ytPlayer.pause();
      else ytPlayer.resume();
    }
  }

  function playNext() {
    const next = currentIdxRef.current + 1;
    const q = queueRef.current;
    if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
  }

  function playPrev() {
    if (usingLocalRef.current) {
      const a = localAudioRef.current;
      if (a && a.currentTime > 3) { a.currentTime = 0; return; }
    } else if (ytPlayer.getCurrentTime() > 3) {
      ytPlayer.seekTo(0);
      return;
    }
    const prev = currentIdxRef.current - 1;
    const q = queueRef.current;
    if (prev >= 0) { currentIdxRef.current = prev; loadAndPlay(q[prev]); }
  }

  function seekTo(seconds: number) {
    if (!isFinite(seconds) || seconds < 0) return;
    if (usingLocalRef.current && localAudioRef.current) {
      localAudioRef.current.currentTime = seconds;
    } else {
      ytPlayer.seekTo(seconds);
    }
    if ("mediaSession" in navigator && status.duration > 0) {
      try {
        navigator.mediaSession.setPositionState?.({
          duration: status.duration, playbackRate: 1, position: seconds,
        });
      } catch {}
    }
  }

  function clearPlayer() {
    try { ytPlayer.stop(); } catch {}
    if (localAudioRef.current) { localAudioRef.current.pause(); localAudioRef.current.src = ""; }
    usingLocalRef.current = false;
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
