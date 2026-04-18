import { useEffect, useRef, useState } from "react";
import type { StoredTrack } from "@/lib/storage";

interface Props {
  track: StoredTrack;
  queue: StoredTrack[];
  onClose: () => void;
  onTrackChange: (track: StoredTrack) => void;
}

export default function AudioPlayer({ track, queue, onClose, onTrackChange }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [imgErr, setImgErr] = useState(false);

  const currentIndex = queue.findIndex((t) => t.videoId === track.videoId);

  useEffect(() => {
    setImgErr(false);
    setProgress(0);
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.src = track.streamUrl;
      audioRef.current.load();
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [track.videoId, track.streamUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    const onEnded = () => {
      if (currentIndex < queue.length - 1) {
        onTrackChange(queue[currentIndex + 1]);
      } else {
        setPlaying(false);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [currentIndex, queue, onTrackChange]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch(() => {});
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setProgress(val);
    if (audioRef.current) audioRef.current.currentTime = val;
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
  };

  const prev = () => {
    if (currentIndex > 0) onTrackChange(queue[currentIndex - 1]);
  };

  const next = () => {
    if (currentIndex < queue.length - 1) onTrackChange(queue[currentIndex + 1]);
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="player-bar slide-up fixed bottom-0 left-0 right-0 z-40"
      style={{
        background: "#0d0d0d",
        borderTop: "1px solid #1DB95430",
      }}
    >
      <audio ref={audioRef} preload="auto" />

      <div
        className="relative w-full"
        style={{ height: 2, background: "#222", cursor: "pointer" }}
        onClick={(e) => {
          if (!duration) return;
          const rect = (e.target as HTMLDivElement).getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const time = ratio * duration;
          setProgress(time);
          if (audioRef.current) audioRef.current.currentTime = time;
        }}
      >
        <div
          className="h-full transition-all"
          style={{ width: duration ? `${(progress / duration) * 100}%` : "0%", background: "#1DB954" }}
        />
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="relative flex-shrink-0 rounded-lg overflow-hidden"
          style={{ width: 44, height: 44 }}
        >
          {track.thumbnail && !imgErr ? (
            <img
              src={track.thumbnail}
              alt={track.title}
              className={`w-full h-full object-cover ${playing ? "disc-spin" : ""}`}
              style={{ borderRadius: "50%" }}
              onError={() => setImgErr(true)}
            />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center text-xl ${playing ? "disc-spin" : ""}`}
              style={{ background: "#1a1a1a", borderRadius: "50%" }}
            >
              🎵
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0" dir="rtl">
          <p className="text-white text-sm font-semibold truncate">{track.title}</p>
          <p className="text-[#888] text-xs truncate">{track.artist}</p>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[#888] text-xs">{fmt(progress)}</span>
          <span className="text-[#555] text-xs">/</span>
          <span className="text-[#888] text-xs">{fmt(duration)}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            disabled={currentIndex <= 0}
            className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-30"
            style={{ color: "#fff" }}
          >
            ⏮
          </button>

          <button
            onClick={togglePlay}
            className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 flex items-center justify-center"
            style={{
              background: "#1DB954",
              color: "#000",
              width: 40,
              height: 40,
              fontSize: 16,
              fontWeight: "bold",
            }}
          >
            {playing ? "⏸" : "▶"}
          </button>

          <button
            onClick={next}
            disabled={currentIndex >= queue.length - 1}
            className="p-2 rounded-full transition-all hover:scale-110 active:scale-95 disabled:opacity-30"
            style={{ color: "#fff" }}
          >
            ⏭
          </button>
        </div>

        <div className="flex items-center gap-2 hidden sm:flex">
          <span style={{ color: "#888", fontSize: 13 }}>🔊</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={changeVolume}
            style={{ width: 70, accentColor: "#1DB954" }}
          />
        </div>

        <button
          onClick={onClose}
          className="p-2 transition-all hover:scale-110"
          style={{ color: "#555" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
