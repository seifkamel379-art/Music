import { createAudioPlayer, setAudioModeAsync, useAudioPlayerStatus } from "expo-audio";
import * as Haptics from "expo-haptics";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export type PlayerTrack = {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  streamUrl: string;
  duration: string;
};

type AudioPlayerContextValue = {
  player: ReturnType<typeof createAudioPlayer>;
  status: ReturnType<typeof useAudioPlayerStatus>;
  currentTrack: PlayerTrack | null;
  queue: PlayerTrack[];
  playTrack: (track: PlayerTrack, newQueue?: PlayerTrack[]) => Promise<void>;
  pauseOrResume: () => void;
  playNext: () => void;
  playPrev: () => void;
  seekTo: (seconds: number) => void;
  setQueue: (tracks: PlayerTrack[]) => void;
};

const Ctx = createContext<AudioPlayerContextValue | null>(null);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const player = useRef(
    createAudioPlayer(null, { updateInterval: 500 }),
  ).current;
  const status = useAudioPlayerStatus(player);
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const currentIndexRef = useRef(0);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      allowsRecording: false,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (status.didJustFinish) {
      const nextIndex = currentIndexRef.current + 1;
      if (nextIndex < queue.length) {
        const nextTrack = queue[nextIndex];
        currentIndexRef.current = nextIndex;
        loadAndPlay(nextTrack);
      }
    }
  }, [status.didJustFinish]);

  async function loadAndPlay(track: PlayerTrack) {
    try {
      setCurrentTrack(track);
      player.replace({ uri: track.streamUrl });
      player.play();
      player.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artist,
        albumTitle: "Seif music",
        artworkUrl: track.thumbnail ?? undefined,
      });
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function playTrack(track: PlayerTrack, newQueue?: PlayerTrack[]) {
    if (newQueue) {
      setQueue(newQueue);
      currentIndexRef.current = newQueue.findIndex((t) => t.videoId === track.videoId);
      if (currentIndexRef.current < 0) currentIndexRef.current = 0;
    } else {
      currentIndexRef.current = queue.findIndex((t) => t.videoId === track.videoId);
      if (currentIndexRef.current < 0) currentIndexRef.current = 0;
    }
    await loadAndPlay(track);
  }

  function pauseOrResume() {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  function playNext() {
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex < queue.length) {
      currentIndexRef.current = nextIndex;
      loadAndPlay(queue[nextIndex]);
    }
  }

  function playPrev() {
    if (status.currentTime > 3) {
      player.seekTo(0);
      return;
    }
    const prevIndex = currentIndexRef.current - 1;
    if (prevIndex >= 0) {
      currentIndexRef.current = prevIndex;
      loadAndPlay(queue[prevIndex]);
    }
  }

  function seekTo(seconds: number) {
    player.seekTo(seconds);
  }

  const value = useMemo<AudioPlayerContextValue>(
    () => ({
      player,
      status,
      currentTrack,
      queue,
      playTrack,
      pauseOrResume,
      playNext,
      playPrev,
      seekTo,
      setQueue,
    }),
    [status, currentTrack, queue],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudioPlayer() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAudioPlayer must be inside AudioPlayerProvider");
  return v;
}
