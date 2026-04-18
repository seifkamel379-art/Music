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

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const currentIdxRef = useRef(0);
  const [status, setStatus] = useState<Status>({
    playing: false, currentTime: 0, duration: 0, isBuffering: false,
  });

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onTimeUpdate = () => setStatus(s => ({ ...s, currentTime: audio.currentTime }));
    const onDuration = () => setStatus(s => ({ ...s, duration: isFinite(audio.duration) ? audio.duration : 0 }));
    const onPlay = () => setStatus(s => ({ ...s, playing: true, isBuffering: false }));
    const onPause = () => setStatus(s => ({ ...s, playing: false }));
    const onWaiting = () => setStatus(s => ({ ...s, isBuffering: true }));
    const onCanPlay = () => setStatus(s => ({ ...s, isBuffering: false }));
    const onEnded = () => {
      const next = currentIdxRef.current + 1;
      setQueue(q => {
        if (next < q.length) {
          currentIdxRef.current = next;
          loadAndPlay(q[next]);
        } else {
          setStatus(s => ({ ...s, playing: false }));
        }
        return q;
      });
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
    };
  }, []);

  function loadAndPlay(track: Track) {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTrack(track);
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: true });
    audio.src = track.streamUrl;
    audio.load();
    audio.play().catch(() => {});
  }

  function playTrack(track: Track, newQueue?: Track[]) {
    if (newQueue) {
      setQueue(newQueue);
      currentIdxRef.current = Math.max(0, newQueue.findIndex(t => t.videoId === track.videoId));
    } else {
      setQueue(q => {
        currentIdxRef.current = Math.max(0, q.findIndex(t => t.videoId === track.videoId));
        return q;
      });
    }
    loadAndPlay(track);
  }

  function pauseOrResume() {
    const audio = audioRef.current;
    if (!audio) return;
    if (status.playing) audio.pause();
    else audio.play().catch(() => {});
  }

  function playNext() {
    const next = currentIdxRef.current + 1;
    setQueue(q => {
      if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
      return q;
    });
  }

  function playPrev() {
    const audio = audioRef.current;
    if (audio && status.currentTime > 3) { audio.currentTime = 0; return; }
    const prev = currentIdxRef.current - 1;
    setQueue(q => {
      if (prev >= 0) { currentIdxRef.current = prev; loadAndPlay(q[prev]); }
      return q;
    });
  }

  function seekTo(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !isFinite(seconds)) return;
    audio.currentTime = seconds;
  }

  function clearPlayer() {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    setCurrentTrack(null);
    setQueue([]);
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: false });
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
