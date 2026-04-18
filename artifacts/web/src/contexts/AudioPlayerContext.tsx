import React, { createContext, useContext, useEffect, useRef, useState, useMemo } from "react";

export type Track = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const currentIdxRef = useRef(0);
  const queueRef = useRef<Track[]>([]);
  const [status, setStatus] = useState<Status>({
    playing: false, currentTime: 0, duration: 0, isBuffering: false,
  });

  /* Keep queueRef in sync */
  useEffect(() => { queueRef.current = queue; }, [queue]);

  /* Setup audio element once */
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onTime = () => setStatus(s => ({ ...s, currentTime: audio.currentTime }));
    const onDur = () => setStatus(s => ({ ...s, duration: isFinite(audio.duration) ? audio.duration : 0 }));
    const onPlay = () => {
      setStatus(s => ({ ...s, playing: true, isBuffering: false }));
      setCurrentTrack(t => { updateMediaSession(t, true); return t; });
    };
    const onPause = () => {
      setStatus(s => ({ ...s, playing: false }));
      setCurrentTrack(t => { updateMediaSession(t, false); return t; });
    };
    const onWait = () => setStatus(s => ({ ...s, isBuffering: true }));
    const onCan = () => setStatus(s => ({ ...s, isBuffering: false }));
    const onEnd = () => {
      const next = currentIdxRef.current + 1;
      const q = queueRef.current;
      if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
      else setStatus(s => ({ ...s, playing: false }));
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDur);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWait);
    audio.addEventListener("canplay", onCan);
    audio.addEventListener("ended", onEnd);

    /* Media Session handlers */
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", () => audio.play().catch(() => {}));
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        const next = currentIdxRef.current + 1;
        const q = queueRef.current;
        if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (audio.currentTime > 3) { audio.currentTime = 0; return; }
        const prev = currentIdxRef.current - 1;
        const q = queueRef.current;
        if (prev >= 0) { currentIdxRef.current = prev; loadAndPlay(q[prev]); }
      });
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (d.seekTime !== undefined) audio.currentTime = d.seekTime;
      });
    }

    return () => {
      audio.pause(); audio.src = "";
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDur);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWait);
      audio.removeEventListener("canplay", onCan);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  function loadAndPlay(track: Track) {
    const audio = audioRef.current; if (!audio) return;
    setCurrentTrack(track);
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: true });
    updateMediaSession(track, false);
    audio.src = track.streamUrl;
    audio.load();
    audio.play().catch(() => {});
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
    const audio = audioRef.current; if (!audio) return;
    if (status.playing) audio.pause(); else audio.play().catch(() => {});
  }

  function playNext() {
    const next = currentIdxRef.current + 1;
    const q = queueRef.current;
    if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
  }

  function playPrev() {
    const audio = audioRef.current;
    if (audio && status.currentTime > 3) { audio.currentTime = 0; return; }
    const prev = currentIdxRef.current - 1;
    const q = queueRef.current;
    if (prev >= 0) { currentIdxRef.current = prev; loadAndPlay(q[prev]); }
  }

  function seekTo(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !isFinite(seconds) || seconds < 0) return;
    audio.currentTime = seconds;
    if ("mediaSession" in navigator && status.duration > 0) {
      navigator.mediaSession.setPositionState?.({ duration: status.duration, playbackRate: 1, position: seconds });
    }
  }

  function clearPlayer() {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    setCurrentTrack(null); setQueue([]); queueRef.current = [];
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
