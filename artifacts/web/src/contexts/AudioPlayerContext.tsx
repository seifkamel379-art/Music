/* Audio Player — HTML5 <audio> primary, YouTube IFrame API fallback.
 *
 * Stream resolution order:
 *   1. Cloudflare Worker → direct CDN URL → <audio> + hls.js
 *   2. API server (Innertube + yt-dlp) → direct CDN URL → <audio> + hls.js
 *   3. YouTube IFrame API (uses user's IP, works for ANY YouTube/YT-Music track)
 *      → continues playing in background, lock screen via MediaSession API
 */
import React, {
  createContext, useContext, useEffect, useRef,
  useState, useMemo, useCallback,
} from "react";
import Hls from "hls.js";
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
// YouTube IFrame API loader (singleton)
// ──────────────────────────────────────────────────────────
let ytApiLoaded = false;
let ytApiCallbacks: Array<() => void> = [];

function loadYtApi(): Promise<void> {
  if (ytApiLoaded && (window as any).YT?.Player) return Promise.resolve();
  return new Promise(resolve => {
    ytApiCallbacks.push(resolve);
    if (!document.getElementById("yt-iframe-api-script")) {
      const prev = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        prev?.();
        ytApiLoaded = true;
        ytApiCallbacks.forEach(cb => cb());
        ytApiCallbacks = [];
      };
      const s = document.createElement("script");
      s.id = "yt-iframe-api-script";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    } else if (ytApiLoaded && (window as any).YT?.Player) {
      resolve();
    }
  });
}

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

  // HTML5 audio
  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const hlsRef           = useRef<Hls | null>(null);
  // YouTube IFrame player
  const ytPlayerRef      = useRef<any>(null);
  const isYtModeRef      = useRef(false);
  const ytPollRef        = useRef<number | null>(null);
  // Shared
  const currentIdxRef    = useRef(0);
  const queueRef         = useRef<Track[]>([]);
  const currentTrackRef  = useRef<Track | null>(null);
  const resolveAbortRef  = useRef<AbortController | null>(null);

  useEffect(() => { queueRef.current       = queue;        }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // Pre-load YouTube IFrame API on mount
  useEffect(() => { loadYtApi(); }, []);

  // ── Native position-state sync (throttled to every 5 s) ──
  const lastNativeSyncRef = useRef(0);
  function maybeNativeSyncPosition(ct: number, dur: number, playing: boolean) {
    const now = Date.now();
    if (now - lastNativeSyncRef.current < 5000) return;
    lastNativeSyncRef.current = now;
    updatePlaybackState({ playing, positionMs: Math.floor(ct * 1000), durationMs: Math.floor(dur * 1000) });
  }

  // ──────────────────────────────────────────────────────────
  // YouTube IFrame player helpers
  // ──────────────────────────────────────────────────────────
  function stopYtPoll() {
    if (ytPollRef.current !== null) {
      clearInterval(ytPollRef.current);
      ytPollRef.current = null;
    }
  }

  function startYtPoll() {
    stopYtPoll();
    ytPollRef.current = window.setInterval(() => {
      const yp = ytPlayerRef.current;
      if (!yp?.getCurrentTime || !isYtModeRef.current) return;
      try {
        const ct  = yp.getCurrentTime() || 0;
        const dur = yp.getDuration()    || 0;
        setStatus(s => ({ ...s, currentTime: ct, duration: dur }));
        updateBrowserPositionState(ct, dur);
        maybeNativeSyncPosition(ct, dur, true);
      } catch {}
    }, 500);
  }

  // Called by YT.Player onStateChange
  const handleYtStateChange = useCallback((event: any) => {
    if (!isYtModeRef.current) return;
    const YT_PLAYING   = 1;
    const YT_PAUSED    = 2;
    const YT_BUFFERING = 3;
    const YT_ENDED     = 0;

    switch (event.data) {
      case YT_PLAYING:
        setStatus(s => ({ ...s, playing: true, isBuffering: false }));
        startYtPoll();
        updateBrowserMediaSession(currentTrackRef.current, true);
        updatePlaybackState({
          playing: true,
          positionMs: 0,
          durationMs: Math.floor((ytPlayerRef.current?.getDuration?.() || 0) * 1000),
        });
        break;
      case YT_PAUSED:
        setStatus(s => ({ ...s, playing: false }));
        stopYtPoll();
        updateBrowserMediaSession(currentTrackRef.current, false);
        break;
      case YT_BUFFERING:
        setStatus(s => ({ ...s, isBuffering: true }));
        break;
      case YT_ENDED:
        stopYtPoll();
        setStatus(s => ({ ...s, playing: false, isBuffering: false }));
        {
          const next = currentIdxRef.current + 1;
          const q    = queueRef.current;
          if (next < q.length) { currentIdxRef.current = next; loadAndPlay(q[next]); }
          else {
            updateBrowserMediaSession(currentTrackRef.current, false);
            updatePlaybackState({ playing: false, positionMs: 0, durationMs: 0 });
          }
        }
        break;
    }
  }, []);

  // Init or reload the YT.Player with a new videoId.
  // Container is created imperatively outside React's DOM so reconciliation
  // never removes the <iframe> that YouTube injects.
  async function initYtPlayer(videoId: string): Promise<void> {
    await loadYtApi();
    const YT = (window as any).YT;
    if (!YT?.Player) throw new Error("YouTube IFrame API failed to load");

    if (ytPlayerRef.current) {
      // Player already exists — just load the new video
      ytPlayerRef.current.loadVideoById(videoId);
      return;
    }

    // Create a persistent container outside React's control
    const CONTAINER_ID = "yt-iframe-player-root";
    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = CONTAINER_ID;
      container.setAttribute("aria-hidden", "true");
      container.style.cssText =
        "position:fixed;top:-2px;left:-2px;width:1px;height:1px;" +
        "opacity:0;pointer-events:none;z-index:-9999;overflow:hidden;";
      document.body.appendChild(container);
    }

    return new Promise((resolve, reject) => {
      ytPlayerRef.current = new YT.Player(container, {
        width:  "1",
        height: "1",
        videoId,
        playerVars: {
          autoplay:        1,
          controls:        0,
          disablekb:       1,
          iv_load_policy:  3,
          modestbranding:  1,
          playsinline:     1,
          rel:             0,
        },
        events: {
          onReady:       () => resolve(),
          onStateChange: handleYtStateChange,
          onError:       (e: any) => reject(new Error(`YT player error ${e.data}`)),
        },
      });
    });
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

    const handlePlay = () => {
      if (isYtModeRef.current) ytPlayerRef.current?.playVideo?.();
      else getAudio().play().catch(() => {});
    };
    const handlePause = () => {
      if (isYtModeRef.current) ytPlayerRef.current?.pauseVideo?.();
      else getAudio().pause();
    };
    const handleNext = () => {
      const nxt = currentIdxRef.current + 1;
      const q   = queueRef.current;
      if (nxt < q.length) { currentIdxRef.current = nxt; loadAndPlay(q[nxt]); }
    };
    const handlePrev = () => {
      if (!isYtModeRef.current) {
        const a = audioRef.current;
        if (a && a.currentTime > 3) { a.currentTime = 0; return; }
      } else {
        const ct = ytPlayerRef.current?.getCurrentTime?.() || 0;
        if (ct > 3) { ytPlayerRef.current?.seekTo?.(0, true); return; }
      }
      const prv = currentIdxRef.current - 1;
      const q   = queueRef.current;
      if (prv >= 0) { currentIdxRef.current = prv; loadAndPlay(q[prv]); }
    };

    ms.setActionHandler("play",          handlePlay);
    ms.setActionHandler("pause",         handlePause);
    ms.setActionHandler("nexttrack",     handleNext);
    ms.setActionHandler("previoustrack", handlePrev);
    ms.setActionHandler("seekto",        d => {
      if (d.seekTime === undefined) return;
      if (isYtModeRef.current) ytPlayerRef.current?.seekTo?.(d.seekTime, true);
      else { const a = audioRef.current; if (a) a.currentTime = d.seekTime; }
    });
    ms.setActionHandler("seekbackward", d => {
      const off = d.seekOffset ?? 10;
      if (isYtModeRef.current) {
        const ct = ytPlayerRef.current?.getCurrentTime?.() || 0;
        ytPlayerRef.current?.seekTo?.(Math.max(0, ct - off), true);
      } else {
        const a = audioRef.current; if (a) a.currentTime = Math.max(0, a.currentTime - off);
      }
    });
    ms.setActionHandler("seekforward", d => {
      const off = d.seekOffset ?? 10;
      if (isYtModeRef.current) {
        const ct  = ytPlayerRef.current?.getCurrentTime?.() || 0;
        const dur = ytPlayerRef.current?.getDuration?.() || 0;
        ytPlayerRef.current?.seekTo?.(Math.min(dur, ct + off), true);
      } else {
        const a = audioRef.current; if (a) a.currentTime = Math.min(a.duration || 0, a.currentTime + off);
      }
    });
  }, [getAudio]);

  // ── Native Android transport control listener ─────────────
  useEffect(() => {
    const remove = addTransportListener(evt => {
      const audio = audioRef.current;
      switch (evt.command) {
        case "play":
          if (isYtModeRef.current) ytPlayerRef.current?.playVideo?.();
          else audio?.play().catch(() => {});
          break;
        case "pause":
          if (isYtModeRef.current) ytPlayerRef.current?.pauseVideo?.();
          else audio?.pause();
          break;
        case "next": {
          const nxt = currentIdxRef.current + 1;
          const q   = queueRef.current;
          if (nxt < q.length) { currentIdxRef.current = nxt; loadAndPlay(q[nxt]); }
          break;
        }
        case "prev": {
          if (isYtModeRef.current) {
            const ct = ytPlayerRef.current?.getCurrentTime?.() || 0;
            if (ct > 3) { ytPlayerRef.current?.seekTo?.(0, true); break; }
          } else if (audio && audio.currentTime > 3) {
            audio.currentTime = 0; break;
          }
          const prv = currentIdxRef.current - 1;
          const q   = queueRef.current;
          if (prv >= 0) { currentIdxRef.current = prv; loadAndPlay(q[prv]); }
          break;
        }
        case "seek":
          if (evt.position !== undefined) {
            if (isYtModeRef.current) ytPlayerRef.current?.seekTo?.(evt.position / 1000, true);
            else if (audio) audio.currentTime = evt.position / 1000;
          }
          break;
        case "stop":
          stopYtPoll();
          if (isYtModeRef.current) ytPlayerRef.current?.stopVideo?.();
          else if (audio) { audio.pause(); audio.currentTime = 0; }
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

    startAudioSession({
      title:      track.title,
      artist:     track.artist,
      thumbnail:  track.thumbnail,
      playing:    false,
      durationMs: 0,
      positionMs: 0,
    });
    updateAudioMetadata({
      title:     track.title,
      artist:    track.artist,
      thumbnail: track.thumbnail,
      durationMs: 0,
    });

    try {
      if (track.localUrl) {
        // ── Local file → always use HTML5 audio ──────────────
        isYtModeRef.current = false;
        stopYtPoll();
        const audio = getAudio();
        audio.pause();
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        audio.removeAttribute("src");
        audio.load();
        if (ctrl.signal.aborted) return;
        audio.src = track.localUrl;
        audio.load();
        await audio.play();
        updatePlaybackState({ playing: true, positionMs: 0, durationMs: Math.floor((audio.duration || 0) * 1000) });
        return;
      }

      const { url } = await resolveStreamUrl(track.videoId);
      if (ctrl.signal.aborted) return;

      // ── YouTube IFrame fallback ───────────────────────────
      if (url.startsWith("yt:")) {
        const ytVideoId = url.slice(3);
        isYtModeRef.current = true;
        stopYtPoll();

        // Pause / detach HTML5 audio so it doesn't double-play
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        const audio = getAudio();
        audio.pause();
        audio.removeAttribute("src");
        audio.load();

        setStatus(s => ({ ...s, isBuffering: true }));
        await initYtPlayer(ytVideoId);
        if (ctrl.signal.aborted) {
          ytPlayerRef.current?.pauseVideo?.();
          return;
        }
        // YT.Player will fire onStateChange → PLAYING which sets status
        return;
      }

      // ── Direct URL → HTML5 audio ──────────────────────────
      isYtModeRef.current = false;
      stopYtPoll();
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.pauseVideo?.(); } catch {}
      }

      const audio = getAudio();
      audio.pause();
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      audio.removeAttribute("src");
      audio.load();

      const isHls = url.includes(".m3u8") || url.includes("/manifest/");
      if (isHls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        hlsRef.current = hls;
        hls.attachMedia(audio);
        hls.loadSource(url);
        await new Promise<void>((resolve, reject) => {
          hls.once(Hls.Events.MANIFEST_PARSED, () => resolve());
          hls.once(Hls.Events.ERROR, (_: unknown, data: any) => {
            if (data.fatal) reject(new Error(`HLS error: ${data.details}`));
          });
        });
        if (ctrl.signal.aborted) { hls.destroy(); hlsRef.current = null; return; }
      } else {
        audio.src = url;
        audio.load();
      }
      await audio.play();
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
    if (isYtModeRef.current) {
      const yp = ytPlayerRef.current;
      if (!yp) return;
      if (status.playing) yp.pauseVideo?.();
      else yp.playVideo?.();
    } else {
      const a = audioRef.current; if (!a) return;
      if (status.playing) a.pause();
      else a.play().catch(() => {});
    }
  }

  function playNext() {
    const nxt = currentIdxRef.current + 1;
    const q   = queueRef.current;
    if (nxt < q.length) { currentIdxRef.current = nxt; loadAndPlay(q[nxt]); }
  }

  function playPrev() {
    if (!isYtModeRef.current) {
      const a = audioRef.current;
      if (a && a.currentTime > 3) { a.currentTime = 0; return; }
    } else {
      const ct = ytPlayerRef.current?.getCurrentTime?.() || 0;
      if (ct > 3) { ytPlayerRef.current?.seekTo?.(0, true); return; }
    }
    const prv = currentIdxRef.current - 1;
    const q   = queueRef.current;
    if (prv >= 0) { currentIdxRef.current = prv; loadAndPlay(q[prv]); }
  }

  function seekTo(seconds: number) {
    if (!isFinite(seconds)) return;
    if (isYtModeRef.current) {
      ytPlayerRef.current?.seekTo?.(Math.max(0, seconds), true);
      setStatus(s => ({ ...s, currentTime: seconds }));
      updateBrowserPositionState(seconds, ytPlayerRef.current?.getDuration?.() || 0);
      updatePlaybackState({
        playing:    status.playing,
        positionMs: Math.floor(seconds * 1000),
        durationMs: Math.floor((ytPlayerRef.current?.getDuration?.() || 0) * 1000),
      });
    } else {
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = Math.max(0, seconds);
      updateBrowserPositionState(seconds, a.duration || 0);
      updatePlaybackState({
        playing:    !a.paused,
        positionMs: Math.floor(seconds * 1000),
        durationMs: Math.floor((a.duration || 0) * 1000),
      });
    }
  }

  function clearPlayer() {
    resolveAbortRef.current?.abort();
    stopYtPoll();
    isYtModeRef.current = false;
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.stopVideo?.(); } catch {}
    }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
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
