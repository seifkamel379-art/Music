import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { ytPlayer, type PlayerState } from "@/lib/youtube-iframe";

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
    album: "music&sk",
    artwork: track.thumbnail
      ? [{ src: track.thumbnail, sizes: "512x512", type: "image/jpeg" }]
      : [{ src: "/logo.png", sizes: "192x192", type: "image/png" }],
  });
  navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [status, setStatus] = useState<Status>({
    playing: false, currentTime: 0, duration: 0, isBuffering: false,
  });

  const currentIdxRef = useRef(0);
  const queueRef = useRef<Track[]>([]);
  const currentTrackRef = useRef<Track | null>(null);

  // Local audio element for device files
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const isLocalRef = useRef(false);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // Subscribe to YouTube IFrame player events
  useEffect(() => {
    const unsubState = ytPlayer.on("stateChange", (state: PlayerState) => {
      if (isLocalRef.current) return;
      setStatus(s => ({
        ...s,
        playing: state === "playing",
        isBuffering: state === "buffering",
      }));
      setCurrentTrack(t => { updateMediaSession(t, state === "playing"); return t; });

      if (state === "ended") {
        const next = currentIdxRef.current + 1;
        const q = queueRef.current;
        if (next < q.length) {
          currentIdxRef.current = next;
          loadAndPlay(q[next]);
        } else {
          setStatus(s => ({ ...s, playing: false }));
        }
      }

      if (state === "error") {
        setStatus(s => ({ ...s, isBuffering: false, playing: false }));
      }
    });

    const unsubTime = ytPlayer.on("timeUpdate", ({ currentTime, duration }) => {
      if (isLocalRef.current) return;
      setStatus(s => ({ ...s, currentTime, duration }));
      if ("mediaSession" in navigator && isFinite(duration) && duration > 0) {
        try {
          navigator.mediaSession.setPositionState?.({
            duration, playbackRate: 1, position: currentTime,
          });
        } catch {}
      }
    });

    return () => {
      unsubState();
      unsubTime();
    };
  }, []);

  // Pre-load YouTube IFrame API
  useEffect(() => {
    ytPlayer.loadAPI().catch(() => {});
  }, []);

  // Media session actions
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => {
      if (isLocalRef.current) { localAudioRef.current?.play().catch(() => {}); }
      else { ytPlayer.resume(); }
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (isLocalRef.current) { localAudioRef.current?.pause(); }
      else { ytPlayer.pause(); }
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const next = currentIdxRef.current + 1;
      const q = queueRef.current;
      if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      if (status.currentTime > 3) { seekTo(0); return; }
      const prev = currentIdxRef.current - 1;
      const q = queueRef.current;
      if (prev >= 0) { currentIdxRef.current = prev; loadAndPlay(q[prev]); }
    });
    navigator.mediaSession.setActionHandler("seekto", d => {
      if (d.seekTime !== undefined) seekTo(d.seekTime);
    });
  }, [status.currentTime]);

  async function loadAndPlay(track: Track) {
    setCurrentTrack(track);
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: true });
    updateMediaSession(track, false);

    // Handle local device files with regular HTML5 Audio
    if (track.localUrl) {
      isLocalRef.current = true;
      ytPlayer.stop();

      if (!localAudioRef.current) {
        const audio = new Audio();
        localAudioRef.current = audio;
        audio.addEventListener("timeupdate", () => {
          setStatus(s => ({ ...s, currentTime: audio.currentTime }));
        });
        audio.addEventListener("durationchange", () => {
          setStatus(s => ({ ...s, duration: isFinite(audio.duration) ? audio.duration : 0 }));
        });
        audio.addEventListener("play", () => {
          setStatus(s => ({ ...s, playing: true, isBuffering: false }));
          updateMediaSession(currentTrackRef.current, true);
        });
        audio.addEventListener("pause", () => {
          setStatus(s => ({ ...s, playing: false }));
          updateMediaSession(currentTrackRef.current, false);
        });
        audio.addEventListener("waiting", () => setStatus(s => ({ ...s, isBuffering: true })));
        audio.addEventListener("canplay", () => setStatus(s => ({ ...s, isBuffering: false })));
        audio.addEventListener("ended", () => {
          const next = currentIdxRef.current + 1;
          const q = queueRef.current;
          if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
          else setStatus(s => ({ ...s, playing: false }));
        });
      }

      localAudioRef.current.src = track.localUrl;
      localAudioRef.current.load();
      localAudioRef.current.play().catch(() => {});
      return;
    }

    // YouTube IFrame API for all other tracks
    isLocalRef.current = false;
    if (localAudioRef.current) {
      localAudioRef.current.pause();
      localAudioRef.current.src = "";
    }

    try {
      await ytPlayer.play(track.videoId);
    } catch (e) {
      console.error("[player] YouTube IFrame failed:", e);
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
    if (isLocalRef.current) {
      const la = localAudioRef.current;
      if (!la) return;
      if (status.playing) la.pause(); else la.play().catch(() => {});
    } else {
      if (status.playing) ytPlayer.pause(); else ytPlayer.resume();
    }
  }

  function playNext() {
    const next = currentIdxRef.current + 1;
    const q = queueRef.current;
    if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
  }

  function playPrev() {
    if (status.currentTime > 3) { seekTo(0); return; }
    const prev = currentIdxRef.current - 1;
    const q = queueRef.current;
    if (prev >= 0) { currentIdxRef.current = prev; loadAndPlay(q[prev]); }
  }

  function seekTo(seconds: number) {
    if (!isFinite(seconds) || seconds < 0) return;
    if (isLocalRef.current) {
      if (localAudioRef.current) localAudioRef.current.currentTime = seconds;
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
    ytPlayer.stop();
    if (localAudioRef.current) { localAudioRef.current.pause(); localAudioRef.current.src = ""; }
    isLocalRef.current = false;
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
