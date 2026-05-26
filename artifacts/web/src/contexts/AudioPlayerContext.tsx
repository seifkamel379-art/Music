/* Audio Player — 100% native <audio>, no YouTube iframe.
 * Online tracks  : Cloudflare Worker → direct URL → <audio>
 * Local tracks   : blob URL → <audio>
 * Web/browser    : HTML5 Media Session API (lock screen on Chrome)
 * Android APK    : Native Foreground Service + MediaSession via audiosession.ts
 *                  → real lock-screen notification with controls, even screen off
 */
import React, {
  createContext, useContext, useEffect, useRef,
  useState, useMemo, useCallback,
} from "react";
import { resolveStreamUrl } from "../lib/streamer";
import {
  startAudioSession,
  updateAudioMetadata,
  updatePlaybackState,
  stopAudioSession,
  addTransportListener,
} from "../lib/audiosession";

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

// ──────────────────────────────────────────────────────────
// Browser Media Session (lock screen on Chrome browser/PWA)
// ──────────────────────────────────────────────────────────
function updateBrowserMediaSession(track: Track | null, playing: boolean) {
  if (!("mediaSession" in navigator)) return;
  if (!track) { navigator.mediaSession.metadata = null; return; }
  navigator.mediaSession.metadata = new MediaMetadata({
    title:   track.title,
    artist:  track.artist,
    album:   "seifoo",
    artwork: track.thumbnail
      ? [
          { src: track.thumbnail, sizes: "480x480", type: "image/jpeg" },
          { src: track.thumbnail, sizes: "512x512", type: "image/jpeg" },
        ]
      : [{ src: "/logo.png", sizes: "512x512", type: "image/png" }],
  });
  navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

function updateBrowserPositionState(currentTime: number, duration: number) {
  if (!("mediaSession" in navigator)) return;
  if (!isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState?.({
      duration,
      playbackRate: 1,
      position: Math.min(currentTime, duration),
    });
  } catch {}
}

// ──────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────
export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue,        setQueue]         = useState<Track[]>([]);
  const [status,       setStatus]        = useState<Status>({
    playing: false, currentTime: 0, duration: 0, isBuffering: false,
  });

  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const currentIdxRef    = useRef(0);
  const queueRef         = useRef<Track[]>([]);
  const currentTrackRef  = useRef<Track | null>(null);
  const resolveAbortRef  = useRef<AbortController | null>(null);
  const positionTimerRef = useRef<number | null>(null);

  useEffect(() => { queueRef.current       = queue;        }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // ── Native position-state sync (throttled to every 5 s) ──
  const lastNativeSyncRef = useRef(0);
  function maybeNativeSyncPosition(ct: number, dur: number, playing: boolean) {
    const now = Date.now();
    if (now - lastNativeSyncRef.current < 5000) return;
    lastNativeSyncRef.current = now;
    updatePlaybackState({ playing, positionMs: Math.floor(ct * 1000), durationMs: Math.floor(dur * 1000) });
  }

  // ── Create / wire <audio> element (once) ──────────────────
  const getAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = "auto";

    audio.addEventListener("play", () => {
      setStatus(s => ({ ...s, playing: true, isBuffering: false }));
      const trk = currentTrackRef.current;
      updateBrowserMediaSession(trk, true);
      if (trk) updatePlaybackState({ playing: true, positionMs: Math.floor(audio.currentTime * 1000), durationMs: Math.floor((audio.duration || 0) * 1000) });
    });

    audio.addEventListener("pause", () => {
      setStatus(s => ({ ...s, playing: false }));
      const trk = currentTrackRef.current;
      updateBrowserMediaSession(trk, false);
      if (trk) updatePlaybackState({ playing: false, positionMs: Math.floor(audio.currentTime * 1000), durationMs: Math.floor((audio.duration || 0) * 1000) });
    });

    audio.addEventListener("waiting",  () => setStatus(s => ({ ...s, isBuffering: true })));
    audio.addEventListener("playing",  () => setStatus(s => ({ ...s, isBuffering: false })));
    audio.addEventListener("canplay",  () => setStatus(s => ({ ...s, isBuffering: false })));

    audio.addEventListener("timeupdate", () => {
      const a = audioRef.current; if (!a) return;
      const ct  = a.currentTime;
      const dur = isFinite(a.duration) ? a.duration : 0;
      setStatus(s => ({ ...s, currentTime: ct, duration: dur }));
      updateBrowserPositionState(ct, dur);
      maybeNativeSyncPosition(ct, dur, !a.paused);
    });

    audio.addEventListener("durationchange", () => {
      const a = audioRef.current; if (!a) return;
      const dur = isFinite(a.duration) ? a.duration : 0;
      setStatus(s => ({ ...s, duration: dur }));
    });

    audio.addEventListener("ended", () => {
      const next = currentIdxRef.current + 1;
      const q    = queueRef.current;
      if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
      else {
        setStatus(s => ({ ...s, playing: false }));
        updateBrowserMediaSession(currentTrackRef.current, false);
        updatePlaybackState({ playing: false, positionMs: 0, durationMs: 0 });
      }
    });

    audio.addEventListener("error", () => {
      setStatus(s => ({ ...s, isBuffering: false, playing: false }));
    });

    audioRef.current = audio;
    return audio;
  }, []);

  // ── Browser Media Session transport handlers ──────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play",           () => getAudio().play().catch(() => {}));
    ms.setActionHandler("pause",          () => getAudio().pause());
    ms.setActionHandler("nexttrack",      () => {
      const nxt = currentIdxRef.current + 1;
      const q   = queueRef.current;
      if (nxt < q.length) { currentIdxRef.current = nxt; loadAndPlay(q[nxt]); }
    });
    ms.setActionHandler("previoustrack",  () => {
      const a = audioRef.current;
      if (a && a.currentTime > 3) { a.currentTime = 0; return; }
      const prv = currentIdxRef.current - 1;
      const q   = queueRef.current;
      if (prv >= 0) { currentIdxRef.current = prv; loadAndPlay(q[prv]); }
    });
    ms.setActionHandler("seekto",         d => {
      if (d.seekTime !== undefined) { const a = audioRef.current; if (a) a.currentTime = d.seekTime; }
    });
    ms.setActionHandler("seekbackward",   d => {
      const a = audioRef.current; if (a) a.currentTime = Math.max(0, a.currentTime - (d.seekOffset ?? 10));
    });
    ms.setActionHandler("seekforward",    d => {
      const a = audioRef.current; if (a) a.currentTime = Math.min(a.duration || 0, a.currentTime + (d.seekOffset ?? 10));
    });
  }, [getAudio]);

  // ── Native Android transport control listener ─────────────
  useEffect(() => {
    const remove = addTransportListener(evt => {
      const audio = audioRef.current;
      switch (evt.command) {
        case "play":
          audio?.play().catch(() => {});
          break;
        case "pause":
          audio?.pause();
          break;
        case "next": {
          const nxt = currentIdxRef.current + 1;
          const q   = queueRef.current;
          if (nxt < q.length) { currentIdxRef.current = nxt; loadAndPlay(q[nxt]); }
          break;
        }
        case "prev": {
          if (audio && audio.currentTime > 3) { audio.currentTime = 0; break; }
          const prv = currentIdxRef.current - 1;
          const q   = queueRef.current;
          if (prv >= 0) { currentIdxRef.current = prv; loadAndPlay(q[prv]); }
          break;
        }
        case "seek":
          if (audio && evt.position !== undefined) {
            audio.currentTime = evt.position / 1000;
          }
          break;
        case "stop":
          if (audio) { audio.pause(); audio.currentTime = 0; }
          stopAudioSession();
          break;
      }
    });
    return remove;
  }, []);

  // ── Core play function ────────────────────────────────────
  async function loadAndPlay(track: Track) {
    resolveAbortRef.current?.abort();
    const ctrl = new AbortController();
    resolveAbortRef.current = ctrl;

    setCurrentTrack(track);
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: true });
    updateBrowserMediaSession(track, false);

    // Start / update the native Android foreground service immediately
    // (so the notification appears even before audio starts)
    startAudioSession({
      title:      track.title,
      artist:     track.artist,
      thumbnail:  track.thumbnail,
      playing:    false,
      durationMs: 0,
      positionMs: 0,
    });
    // Also update metadata for native (in case session was already started)
    updateAudioMetadata({
      title:     track.title,
      artist:    track.artist,
      thumbnail: track.thumbnail,
      durationMs: 0,
    });

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
      // Native state: now actually playing
      updatePlaybackState({
        playing:    true,
        positionMs: 0,
        durationMs: Math.floor((audio.duration || 0) * 1000),
      });
    } catch (e: any) {
      if (ctrl.signal.aborted) return;
      console.error("[player] playback error:", e);
      setStatus(s => ({ ...s, isBuffering: false, playing: false }));
      updatePlaybackState({ playing: false, positionMs: 0, durationMs: 0 });
    }
  }

  // ── Public API ────────────────────────────────────────────
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
    const nxt = currentIdxRef.current + 1;
    const q   = queueRef.current;
    if (nxt < q.length) { currentIdxRef.current = nxt; loadAndPlay(q[nxt]); }
  }

  function playPrev() {
    const a = audioRef.current;
    if (a && a.currentTime > 3) { a.currentTime = 0; return; }
    const prv = currentIdxRef.current - 1;
    const q   = queueRef.current;
    if (prv >= 0) { currentIdxRef.current = prv; loadAndPlay(q[prv]); }
  }

  function seekTo(seconds: number) {
    const a = audioRef.current;
    if (!a || !isFinite(seconds)) return;
    a.currentTime = Math.max(0, seconds);
    updateBrowserPositionState(seconds, a.duration || 0);
    updatePlaybackState({
      playing:    !a.paused,
      positionMs: Math.floor(seconds * 1000),
      durationMs: Math.floor((a.duration || 0) * 1000),
    });
  }

  function clearPlayer() {
    resolveAbortRef.current?.abort();
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    setCurrentTrack(null);
    setQueue([]);
    queueRef.current      = [];
    currentIdxRef.current = 0;
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: false });
    updateBrowserMediaSession(null, false);
    stopAudioSession();
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
