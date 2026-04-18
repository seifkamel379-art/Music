import { Ionicons, Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect } from "react";
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BAR_PADDING = 24;
const BAR_WIDTH = SCREEN_WIDTH - BAR_PADDING * 2;
const THUMB_SIZE = 20;

function formatTime(seconds: number) {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseDurationLabel(label?: string | null) {
  if (!label) return 0;
  const parts = label.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

export default function PlayerModal() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentTrack, status, pauseOrResume, playNext, playPrev, seekTo, queue } = useAudioPlayer();

  const duration = status.duration && isFinite(status.duration) ? status.duration : 0;
  const fallbackDuration = parseDurationLabel(currentTrack?.duration);
  const displayDuration = duration > 0 ? duration : fallbackDuration;
  const currentTime = status.currentTime && isFinite(status.currentTime) ? status.currentTime : 0;
  const liveProgress = displayDuration > 0 ? Math.min(1, currentTime / displayDuration) : 0;

  const currentIndex = queue.findIndex((t) => t.videoId === currentTrack?.videoId);
  const hasNext = currentIndex < queue.length - 1;
  const hasPrev = currentIndex > 0;
  const artSize = Math.min(SCREEN_WIDTH - 64, 340);

  const visualProgress = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const seekDisplayTime = useSharedValue(0);

  useEffect(() => {
    if (!isDragging.value) {
      visualProgress.value = liveProgress;
    }
  }, [liveProgress]);

  const callSeekTo = useCallback((seconds: number) => {
    seekTo(seconds);
  }, [seekTo]);

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      isDragging.value = true;
      const ratio = Math.max(0, Math.min(1, e.x / BAR_WIDTH));
      visualProgress.value = ratio;
      seekDisplayTime.value = ratio * displayDuration;
    })
    .onUpdate((e) => {
      const ratio = Math.max(0, Math.min(1, e.x / BAR_WIDTH));
      visualProgress.value = ratio;
      seekDisplayTime.value = ratio * displayDuration;
    })
    .onEnd(() => {
      const t = visualProgress.value * displayDuration;
      isDragging.value = false;
      runOnJS(callSeekTo)(t);
    });

  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      if (!displayDuration || displayDuration <= 0) return;
      const ratio = Math.max(0, Math.min(1, e.x / BAR_WIDTH));
      const t = ratio * displayDuration;
      visualProgress.value = ratio;
      runOnJS(callSeekTo)(t);
    });

  const composed = Gesture.Exclusive(panGesture, tapGesture);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: visualProgress.value * BAR_WIDTH - THUMB_SIZE / 2 },
      { scale: withSpring(isDragging.value ? 1.4 : 1, { damping: 15, stiffness: 220 }) },
    ],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, visualProgress.value * 100))}%`,
  }));

  if (!currentTrack) {
    return (
      <View style={[styles.container, { backgroundColor: colors.espresso, paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="chevron-down" size={28} color="#FFFFFF" />
        </Pressable>
        <View style={styles.center}>
          <Feather name="music" size={64} color={colors.gold} />
          <Text style={[styles.noTrack, { color: "rgba(255,255,255,0.6)" }]}>اختار أغنية تبدأ تشغيلها</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.espresso, paddingTop: Platform.OS === "ios" ? insets.top + 8 : 32, paddingBottom: Math.max(insets.bottom, 24) }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.closeBtn}>
          <Ionicons name="chevron-down" size={30} color="#FFFFFF" />
        </Pressable>
        <View style={styles.topCenter}>
          <Text style={styles.topLabel}>تشغيل الآن</Text>
          <Text numberOfLines={1} style={styles.topTitle}>{currentTrack.title}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <View style={[styles.artWrapper, { width: artSize, height: artSize }]}>
        {currentTrack.thumbnail ? (
          <Image
            source={{ uri: currentTrack.thumbnail }}
            style={[styles.art, { width: artSize, height: artSize }]}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.art, styles.artPlaceholder, { width: artSize, height: artSize, backgroundColor: colors.muted }]}>
            <Feather name="music" size={80} color={colors.primary} />
          </View>
        )}
        {status.isBuffering && (
          <View style={styles.bufferingOverlay}>
            <Text style={styles.bufferingText}>تحميل...</Text>
          </View>
        )}
      </View>

      <View style={styles.infoRow}>
        <View style={styles.trackInfo}>
          <Text numberOfLines={1} style={styles.trackTitle}>{currentTrack.title}</Text>
          <Text numberOfLines={1} style={styles.trackArtist}>{currentTrack.artist}</Text>
        </View>
      </View>

      <View style={styles.progressSection}>
        <GestureDetector gesture={composed}>
          <View style={styles.seekHitArea} collapsable={false}>
            <View style={[styles.progressBarBg, { backgroundColor: "rgba(255,244,223,0.15)" }]}>
              <Animated.View style={[styles.progressBarFill, { backgroundColor: colors.gold }, fillStyle]} />
            </View>
            <Animated.View
              style={[
                styles.progressThumb,
                { backgroundColor: colors.gold, shadowColor: colors.gold },
                thumbStyle,
              ]}
            />
          </View>
        </GestureDetector>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
          <Text style={styles.timeText}>
            {duration > 0 ? formatTime(duration) : currentTrack.duration || formatTime(displayDuration)}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={playPrev}
          hitSlop={12}
          style={[styles.sideBtn, !hasPrev && { opacity: 0.35 }]}
          disabled={!hasPrev}
        >
          <Ionicons name="play-skip-back" size={30} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={pauseOrResume}
          style={[styles.playBtn, { backgroundColor: colors.gold }]}
        >
          <Ionicons
            name={status.playing ? "pause" : "play"}
            size={36}
            color={colors.espresso}
            style={{ marginLeft: status.playing ? 0 : 3 }}
          />
        </Pressable>

        <Pressable
          onPress={playNext}
          hitSlop={12}
          style={[styles.sideBtn, !hasNext && { opacity: 0.35 }]}
          disabled={!hasNext}
        >
          <Ionicons name="play-skip-forward" size={30} color="#FFFFFF" />
        </Pressable>
      </View>

      {queue.length > 1 && (
        <View style={styles.queueInfo}>
          <Text style={styles.queueText}>{currentIndex + 1} / {queue.length} من القائمة</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  noTrack: { fontSize: 18, fontFamily: "Inter_500Medium" },
  topBar: { width: "100%", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 24 },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topCenter: { flex: 1, alignItems: "center" },
  topLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  topTitle: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 2, maxWidth: 200, textAlign: "center" },
  artWrapper: { borderRadius: 28, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 30, elevation: 15, marginBottom: 36 },
  art: { borderRadius: 28 },
  artPlaceholder: { alignItems: "center", justifyContent: "center" },
  bufferingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", borderRadius: 28 },
  bufferingText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  infoRow: { width: "100%", paddingHorizontal: 24, marginBottom: 28 },
  trackInfo: { flex: 1 },
  trackTitle: { color: "#FFFFFF", fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  trackArtist: { color: "rgba(255,255,255,0.65)", fontSize: 16, fontFamily: "Inter_500Medium", marginTop: 6 },
  progressSection: { width: "100%", paddingHorizontal: BAR_PADDING, marginBottom: 36 },
  seekHitArea: { height: 44, justifyContent: "center", position: "relative" },
  progressBarBg: { height: 5, borderRadius: 3, overflow: "hidden", width: "100%" },
  progressBarFill: { height: 5, borderRadius: 3 },
  progressThumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: (44 - THUMB_SIZE) / 2,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 5,
  },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  timeText: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontFamily: "Inter_500Medium" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 32, marginBottom: 28 },
  sideBtn: { width: 54, height: 54, alignItems: "center", justifyContent: "center" },
  playBtn: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", shadowColor: "#d7a45f", shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  queueInfo: { alignItems: "center" },
  queueText: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontFamily: "Inter_500Medium" },
});
