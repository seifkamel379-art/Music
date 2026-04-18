import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSearchTracks, useMusicLogin } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system";
import * as Linking from "expo-linking";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudioPlayer, type PlayerTrack } from "@/contexts/AudioPlayerContext";
import { useLocalMusic } from "@/contexts/LocalMusicContext";
import { useSession } from "@/contexts/SessionContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useColors } from "@/hooks/useColors";

type Section = "home" | "search" | "playlist" | "favorites" | "device";

type DeviceTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  uri: string;
};

const domain = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
const quickSearches = ["اغاني مصرية", "عمرو دياب", "ويجز", "تامر حسني", "أم كلثوم", "راب مصري"];
const navItems: { section: Section; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { section: "home", label: "الرئيسية", icon: "home" },
  { section: "search", label: "بحث", icon: "search" },
  { section: "playlist", label: "مكتبتك", icon: "list" },
  { section: "favorites", label: "المفضلة", icon: "heart" },
  { section: "device", label: "جهازي", icon: "smartphone" },
];

function getAbsoluteUrl(url?: string | null) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${domain}${url}`;
}

function getCover(index: number) {
  const covers = [
    require("@/assets/images/cover-one.png"),
    require("@/assets/images/cover-two.png"),
    require("@/assets/images/cover-three.png"),
  ];
  return covers[index % covers.length];
}

function formatDurationMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function safeFileName(title: string) {
  return (
    title
      .replace(/[^\w\u0600-\u06FF\s\-().]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 120) || "song"
  );
}

function getDownloadUrl(track: Pick<PlayerTrack, "streamUrl" | "title">) {
  const relativePath = track.streamUrl.startsWith(domain) ? track.streamUrl.slice(domain.length) : track.streamUrl;
  const separator = relativePath.includes("?") ? "&" : "?";
  return getAbsoluteUrl(`${relativePath}${separator}download=1&title=${encodeURIComponent(track.title)}`);
}

function triggerWebDownload(url: string, filename: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

function getChromeIntentUrl(url: string) {
  const scheme = url.startsWith("http://") ? "http" : "https";
  const withoutScheme = url.replace(/^https?:\/\//, "");
  return `intent://${withoutScheme}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}


function toPlayerTrack(track: { videoId: string; title: string; artist: string; duration: string; thumbnail?: string | null; streamUrl: string }): PlayerTrack {
  return {
    videoId: track.videoId,
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    thumbnail: track.thumbnail ?? null,
    streamUrl: getAbsoluteUrl(track.streamUrl) ?? track.streamUrl,
  };
}

export default function MusicScreen() {
  const colors = useColors();
  const { themeMode, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { addToPlaylist, removeFromPlaylist, toggleFavorite, isFavorite, playlist, favorites, searchHistory, addSearchHistory, clearSearchHistory } = useLocalMusic();
  const { currentTrack, status, playTrack, pauseOrResume } = useAudioPlayer();

  const [section, setSection] = useState<Section>("home");
  const [query, setQuery] = useState("اغاني مصرية");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [deviceTracks, setDeviceTracks] = useState<DeviceTrack[]>([]);
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const login = useMusicLogin({
    mutation: {
      onSuccess: async (data) => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await session.signIn(data.name);
        setLoginError(null);
      },
      onError: () => {
        setLoginError("الباسورد غلط، جرّب تاني");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
    },
  });

  const search = useSearchTracks(
    { q: query },
    {
      query: {
        enabled: session.ready && !!session.name && query.trim().length > 1,
        staleTime: 60000,
        retry: 1,
      },
    },
  );

  const searchTracks = search.data?.tracks ?? [];
  const featured = playlist.length > 0 ? playlist.slice(0, 6) : searchTracks.slice(0, 6);

  useEffect(() => {
    if (section !== "device") return;
    if (Platform.OS === "web") return;
    if (mediaPermission?.granted) {
      loadDeviceTracks();
    } else {
      requestMediaPermission().then((res) => {
        if (res.granted) loadDeviceTracks();
      });
    }
  }, [section, mediaPermission?.granted]);

  async function loadDeviceTracks() {
    try {
      const { assets } = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 300,
      });
      setDeviceTracks(
        assets.map((a) => ({
          id: a.id,
          title: a.filename.replace(/\.[^/.]+$/, ""),
          artist: "جهازك",
          duration: formatDurationMs(a.duration * 1000),
          uri: a.uri,
        })),
      );
    } catch {
      Alert.alert("خطأ", "تعذّر تحميل ملفات الصوت");
    }
  }

  async function submitLogin() {
    Keyboard.dismiss();
    if (!loginName.trim()) { setLoginError("اكتب اسمك الأول"); return; }
    login.mutate({ data: { name: loginName.trim(), password } });
  }

  function handlePlay(track: PlayerTrack, allTracks: PlayerTrack[]) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playTrack(track, allTracks);
  }

  function handlePlayDevice(track: DeviceTrack, all: DeviceTrack[]) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const pt: PlayerTrack = { videoId: track.id, title: track.title, artist: track.artist, duration: track.duration, thumbnail: null, streamUrl: track.uri };
    const allPt = all.map((t) => ({ videoId: t.id, title: t.title, artist: t.artist, duration: t.duration, thumbnail: null, streamUrl: t.uri }));
    playTrack(pt, allPt);
  }

  async function downloadTrack(track: PlayerTrack, silent = false) {
    const url = getDownloadUrl(track);
    if (!url) return;
    const filename = `${safeFileName(track.title)}.mp3`;
    try {
      if (triggerWebDownload(url, filename)) {
        if (!silent) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      if (Platform.OS === "android") {
        try {
          await Linking.openURL(getChromeIntentUrl(url));
          return;
        } catch {
          await Linking.openURL(url);
          return;
        }
      }
      const fs = FileSystem as typeof FileSystem & {
        downloadAsync?: (uri: string, fileUri: string) => Promise<{ uri: string }>;
        documentDirectory?: string | null;
        cacheDirectory?: string | null;
      };
      const downloadAsync = fs.downloadAsync;
      const baseDirectory = fs.documentDirectory ?? fs.cacheDirectory;
      if (downloadAsync && baseDirectory && Platform.OS !== "web") {
        const result = await downloadAsync(url, `${baseDirectory}${filename}`);
        const media = await MediaLibrary.requestPermissionsAsync();
        if (media.granted) {
          await MediaLibrary.saveToLibraryAsync(result.uri);
          if (!silent) Alert.alert("تم التحميل", `اتحملت باسم ${filename}`);
          return;
        }
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("خطأ", "تعذّر فتح التحميل");
    }
  }

  async function downloadPlaylist() {
    if (playlist.length === 0) return;
    const tracks = playlist.map(toPlayerTrack);
    Alert.alert("تحميل المكتبة", `هيبدأ تحميل ${tracks.length} أغنية في نفس الوقت. انتظر شوية.`);
    await Promise.all(tracks.map((track) => downloadTrack(track, true)));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const activeHasTrack = !!currentTrack;

  const listData: PlayerTrack[] = useMemo(() => {
    if (section === "favorites") return favorites.map(toPlayerTrack);
    if (section === "playlist") return playlist.map(toPlayerTrack);
    if (section === "home" || section === "search") return searchTracks.map(toPlayerTrack);
    return [];
  }, [section, favorites, playlist, searchTracks]);

  const renderNetworkItem = useCallback(
    ({ item, index }: { item: PlayerTrack; index: number }) => {
      const isFav = isFavorite(item.videoId);
      return (
        <TrackRow
          colors={colors}
          track={item}
          index={index}
          isCurrent={currentTrack?.videoId === item.videoId}
          isPlaying={currentTrack?.videoId === item.videoId && status.playing}
          isFavorite={isFav}
          onPlay={() => handlePlay(item, listData)}
          onFavorite={() => { Haptics.selectionAsync(); toggleFavorite({ videoId: item.videoId, title: item.title, artist: item.artist, duration: item.duration, thumbnail: item.thumbnail, streamUrl: item.streamUrl }); }}
          onPlaylist={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); addToPlaylist({ videoId: item.videoId, title: item.title, artist: item.artist, duration: item.duration, thumbnail: item.thumbnail, streamUrl: item.streamUrl }); }}
          onDownload={() => downloadTrack(item)}
          onRemove={section === "playlist" ? () => removeFromPlaylist(item.videoId) : undefined}
        />
      );
    },
    [currentTrack?.videoId, status.playing, section, listData, colors, isFavorite],
  );

  const renderDeviceItem = useCallback(
    ({ item }: { item: DeviceTrack }) => (
      <DeviceTrackRow
        colors={colors}
        track={item}
        isCurrent={currentTrack?.videoId === item.id}
        isPlaying={currentTrack?.videoId === item.id && status.playing}
        onPlay={() => handlePlayDevice(item, deviceTracks)}
      />
    ),
    [currentTrack?.videoId, status.playing, deviceTracks, colors],
  );

  if (!session.ready) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!session.name) {
    return (
      <View style={[styles.loginShell, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <View style={styles.loginGlow} />
        <Pressable onPress={toggleTheme} style={[styles.loginThemeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name={themeMode === "dark" ? "sun" : "moon"} size={20} color={colors.primary} />
        </Pressable>
        <View style={[styles.loginCard, { backgroundColor: colors.sand }]}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons name="music-clef-treble" size={38} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.loginTitle, { color: colors.foreground }]}>music&sk</Text>
          <Text style={[styles.loginSubtitle, { color: colors.mutedForeground }]}>مساحتك الخاصة للمزيكا</Text>
          <TextInput
            value={loginName}
            onChangeText={setLoginName}
            placeholder="اسمك"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            autoCapitalize="words"
          />
          <TextInput
            value={password}
            onChangeText={(v) => { setPassword(v); setLoginError(null); }}
            placeholder="الباسورد"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: loginError ? colors.destructive : colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            secureTextEntry
            onSubmitEditing={submitLogin}
          />
          {loginError ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "22", borderColor: colors.destructive + "55" }]}>
              <Feather name="alert-circle" size={15} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{loginError}</Text>
            </View>
          ) : null}
          <Pressable onPress={submitLogin} style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 }]}>
            {login.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>دخول</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  const headerComponent = (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>PRIVATE STREAM</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>music&sk</Text>
          <Text style={[styles.welcome, { color: colors.mutedForeground }]}>أهلاً {session.name}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={toggleTheme} style={[styles.roundBtn, { backgroundColor: colors.card }]}>
            <Feather name={themeMode === "dark" ? "sun" : "moon"} size={20} color={colors.primary} />
          </Pressable>
          <Pressable onPress={session.signOut} style={[styles.roundBtn, { backgroundColor: colors.card }]}>
            <Feather name="log-out" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.espresso }]}>
        <View style={styles.heroText}>
          <Text style={[styles.heroLabel, { color: colors.gold }]}>موسيقاك الخاصة</Text>
          <Text style={styles.heroTitle}>{playlist.length} أغنية في مكتبتك</Text>
          <Text style={styles.heroSub}>بحث سريع · تشغيل فوري · تحميل كامل</Text>
        </View>
        <View style={styles.heroVisual}>
          <View style={[styles.heroDisc, { borderColor: colors.gold }]}>
            <MaterialCommunityIcons name="music-note-eighth" size={38} color={colors.gold} />
          </View>
          <View style={[styles.heroWave, styles.heroWaveTall, { backgroundColor: colors.gold }]} />
          <View style={[styles.heroWave, { backgroundColor: colors.gold }]} />
          <View style={[styles.heroWave, styles.heroWaveShort, { backgroundColor: colors.gold }]} />
        </View>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={20} color={colors.primary} />
        <TextInput
          value={query}
          onChangeText={(v) => { setQuery(v); if (v.trim().length > 1) setSection("search"); }}
          onEndEditing={() => { if (query.trim().length > 1) addSearchHistory(query.trim()); }}
          onSubmitEditing={() => { if (query.trim().length > 1) addSearchHistory(query.trim()); }}
          placeholder="ابحث عن أي أغنية"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={10}>
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {searchHistory.length > 0 && section !== "device" && (
        <View style={styles.historyHeader}>
          <Text style={[styles.historyLabel, { color: colors.mutedForeground }]}>بحث سابق</Text>
          <Pressable onPress={clearSearchHistory} hitSlop={8}>
            <Text style={[styles.historyClear, { color: colors.destructive }]}>مسح</Text>
          </Pressable>
        </View>
      )}
      {searchHistory.length > 0 && section !== "device" && (
        <FlatList
          data={searchHistory}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.chips}
          renderItem={({ item }) => (
            <Pressable onPress={() => { setQuery(item); setSection("search"); }} style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="clock" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.foreground }]}>{item}</Text>
            </Pressable>
          )}
        />
      )}

      <FlatList
        data={quickSearches}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => (
          <Pressable onPress={() => { setQuery(item); setSection("search"); addSearchHistory(item); }} style={[styles.chip, { backgroundColor: query === item ? colors.primary : colors.card, borderColor: colors.border }]}>
            <Text style={[styles.chipText, { color: query === item ? colors.primaryForeground : colors.foreground }]}>{item}</Text>
          </Pressable>
        )}
      />

      {section === "home" && featured.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>مختارات</Text>
          <FlatList
            data={featured}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.videoId}
            contentContainerStyle={styles.featuredRow}
            renderItem={({ item, index }) => {
              const pt = toPlayerTrack(item);
              return (
                <Pressable onPress={() => handlePlay(pt, featured.map(toPlayerTrack))} style={[styles.featuredCard, { backgroundColor: colors.card }]}>
                  <Image source={item.thumbnail ? { uri: item.thumbnail } : getCover(index)} style={styles.featuredImage} contentFit="cover" />
                  <Text numberOfLines={2} style={[styles.featuredTitle, { color: colors.foreground }]}>{item.title}</Text>
                  <Text numberOfLines={1} style={[styles.featuredArtist, { color: colors.mutedForeground }]}>{item.artist}</Text>
                </Pressable>
              );
            }}
          />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>نتائج البحث</Text>
        </>
      )}

      {section !== "home" && section !== "device" && (
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {section === "playlist" ? `مكتبتك (${playlist.length})` : section === "favorites" ? `المفضلة (${favorites.length})` : "نتائج البحث"}
          </Text>
          {section === "playlist" && playlist.length > 0 ? (
            <Pressable onPress={downloadPlaylist} style={[styles.downloadAllBtn, { backgroundColor: colors.primary }]}>
              <Feather name="download" size={15} color={colors.primaryForeground} />
              <Text style={[styles.downloadAllText, { color: colors.primaryForeground }]}>تحميل الكل</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {section === "device" && <Text style={[styles.sectionTitle, { color: colors.foreground }]}>موسيقى جهازك ({deviceTracks.length})</Text>}

      {search.isFetching && (section === "search" || section === "home") && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
    </View>
  );

  const emptyComponent = (
    <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Feather name={section === "device" ? "smartphone" : "music"} size={28} color={colors.primary} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        {section === "favorites"
          ? "لسه مفيش مفضلة"
          : section === "playlist"
          ? "القائمة فاضية"
          : section === "device"
          ? Platform.OS === "web"
            ? "جهازي غير متاح على الموقع"
            : !mediaPermission?.granted
            ? "محتاج إذن للملفات"
            : "مفيش ملفات صوتية"
          : "ابدأ البحث"}
      </Text>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
        {section === "device"
          ? Platform.OS === "web"
            ? "المتصفح ممنوع يقرأ ملفات الصوت من جهازك للخصوصية. افتح التطبيق على الموبايل عشان يظهر صوت جهازك."
            : "اضغط على جهازي مرة تانية لو مش ظاهر إذن"
          : "دور على الأغاني وضيفها للقائمة أو المفضلة"}
      </Text>
    </View>
  );

  return (
    <View style={[styles.shell, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      {section === "device" ? (
        <FlatList
          data={deviceTracks}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={headerComponent}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={{ paddingBottom: activeHasTrack ? 238 : 118 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={10}
          renderItem={renderDeviceItem}
        />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.videoId}
          ListHeaderComponent={headerComponent}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={{ paddingBottom: activeHasTrack ? 238 : 118 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={10}
          refreshControl={<RefreshControl refreshing={search.isRefetching} onRefresh={() => search.refetch()} tintColor={colors.primary} />}
          renderItem={renderNetworkItem}
        />
      )}

      {activeHasTrack && (
        <Pressable onPress={() => router.push("/player-modal")} style={[styles.player, { backgroundColor: colors.espresso, bottom: 82 }]}>
          {currentTrack.thumbnail ? (
            <Image source={{ uri: currentTrack.thumbnail }} style={styles.playerImage} contentFit="cover" />
          ) : (
            <View style={[styles.playerImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", borderRadius: 17 }]}>
              <Feather name="music" size={20} color={colors.primary} />
            </View>
          )}
          <View style={styles.playerInfo}>
            <Text numberOfLines={1} style={styles.playerTitle}>{currentTrack.title}</Text>
            <Text numberOfLines={1} style={styles.playerArtist}>{status.isBuffering ? "جارٍ التحميل..." : currentTrack.artist}</Text>
          </View>
          <Pressable
            onPress={(e) => { e.stopPropagation(); pauseOrResume(); }}
            style={[styles.playBtn, { backgroundColor: colors.gold }]}
            hitSlop={8}
          >
            <Ionicons name={status.playing ? "pause" : "play"} size={22} color={colors.espresso} />
          </Pressable>
          <View style={[styles.progressMini, { backgroundColor: "rgba(255,244,223,0.15)" }]}>
            <View style={[styles.progressMiniFill, { width: `${(status.currentTime && status.duration ? (status.currentTime / status.duration) * 100 : 0).toFixed(1)}%`, backgroundColor: colors.gold }]} />
          </View>
        </Pressable>
      )}
      <BottomNav section={section} setSection={setSection} colors={colors} />
    </View>
  );
}

function BottomNav({ section, setSection, colors }: { section: Section; setSection: (section: Section) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.bottomNav, { backgroundColor: colors.espresso, borderTopColor: colors.border }]}>
      {navItems.map((item) => {
        const active = section === item.section;
        return (
          <Pressable key={item.section} onPress={() => setSection(item.section)} style={styles.bottomNavItem}>
            <Feather name={item.icon} size={21} color={active ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.bottomNavText, { color: active ? colors.primary : colors.mutedForeground }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TrackRow({ track, index, isCurrent, isPlaying, isFavorite, onPlay, onFavorite, onPlaylist, onDownload, onRemove, colors }: {
  track: PlayerTrack; index: number; isCurrent: boolean; isPlaying: boolean; isFavorite: boolean;
  onPlay: () => void; onFavorite: () => void; onPlaylist: () => void; onDownload: () => void; onRemove?: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable onPress={onPlay} style={[styles.trackRow, { backgroundColor: isCurrent ? colors.secondary : colors.card, borderColor: isCurrent ? colors.primary : colors.border }]}>
      <View>
        <Image source={track.thumbnail ? { uri: track.thumbnail } : getCover(index)} style={styles.trackImage} contentFit="cover" />
        {isPlaying && <View style={styles.playingDot}><View style={[styles.playingDotInner, { backgroundColor: colors.primary }]} /></View>}
      </View>
      <View style={styles.trackText}>
        <Text numberOfLines={1} style={[styles.trackTitle, { color: colors.foreground }]}>{track.title}</Text>
        <Text numberOfLines={1} style={[styles.trackArtist, { color: colors.mutedForeground }]}>{track.artist} · {track.duration}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onFavorite} hitSlop={10}><Ionicons name={isFavorite ? "heart" : "heart-outline"} size={19} color={isFavorite ? "#e05252" : colors.primary} /></Pressable>
        <Pressable onPress={onPlaylist} hitSlop={10}><Feather name="plus-circle" size={19} color={colors.primary} /></Pressable>
        <Pressable onPress={onDownload} hitSlop={10}><Feather name="download" size={19} color={colors.primary} /></Pressable>
        {onRemove ? <Pressable onPress={onRemove} hitSlop={10}><Feather name="trash-2" size={18} color={colors.destructive} /></Pressable> : null}
      </View>
    </Pressable>
  );
}

function DeviceTrackRow({ track, isCurrent, isPlaying, onPlay, colors }: {
  track: DeviceTrack; isCurrent: boolean; isPlaying: boolean; onPlay: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable onPress={onPlay} style={[styles.trackRow, { backgroundColor: isCurrent ? colors.secondary : colors.card, borderColor: isCurrent ? colors.primary : colors.border }]}>
      <View style={[styles.trackImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", borderRadius: 16 }]}>
        <Feather name="music" size={20} color={colors.primary} />
      </View>
      <View style={styles.trackText}>
        <Text numberOfLines={1} style={[styles.trackTitle, { color: colors.foreground }]}>{track.title}</Text>
        <Text numberOfLines={1} style={[styles.trackArtist, { color: colors.mutedForeground }]}>{track.artist} · {track.duration}</Text>
      </View>
      <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={32} color={isCurrent ? colors.primary : colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loginShell: { flex: 1, justifyContent: "center", padding: 22, overflow: "hidden" },
  loginGlow: { position: "absolute", width: 340, height: 340, borderRadius: 170, backgroundColor: "rgba(29,185,84,0.24)", top: 70, right: -120 },
  loginThemeBtn: { position: "absolute", top: 64, right: 20, width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  loginCard: { borderRadius: 34, padding: 24, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 24, elevation: 8 },
  logoCircle: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  loginTitle: { fontSize: 38, fontFamily: "Inter_700Bold", letterSpacing: -1.3 },
  loginSubtitle: { fontSize: 15, fontFamily: "Inter_500Medium", marginTop: 8, marginBottom: 22, lineHeight: 22 },
  input: { height: 56, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 16, fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  errorText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  primaryBtn: { height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center", marginTop: 6 },
  primaryBtnText: { fontSize: 17, fontFamily: "Inter_700Bold" },
  shell: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrow: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.4 },
  title: { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1.2 },
  welcome: { marginTop: 4, fontSize: 14, fontFamily: "Inter_500Medium" },
  roundBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  hero: { marginHorizontal: 18, borderRadius: 22, padding: 18, minHeight: 140, flexDirection: "row", overflow: "hidden" },
  heroText: { flex: 1, justifyContent: "center", zIndex: 1 },
  heroLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  heroTitle: { color: "#FFFFFF", fontSize: 27, fontFamily: "Inter_700Bold", marginTop: 6, letterSpacing: -0.6 },
  heroSub: { color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 19, marginTop: 8, fontFamily: "Inter_500Medium" },
  heroVisual: { width: 128, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  heroDisc: { width: 92, height: 92, borderRadius: 46, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  heroWave: { width: 7, height: 48, borderRadius: 999, opacity: 0.85 },
  heroWaveTall: { height: 72 },
  heroWaveShort: { height: 32 },
  searchBox: { marginHorizontal: 18, marginTop: 16, height: 54, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, height: 52, fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 2 },
  historyLabel: { fontFamily: "Inter_700Bold", fontSize: 12 },
  historyClear: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  chips: { gap: 8, paddingHorizontal: 18, paddingVertical: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  chipText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: 18 },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginHorizontal: 18, marginTop: 20, marginBottom: 10 },
  downloadAllBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9, marginTop: 12 },
  downloadAllText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  featuredRow: { paddingHorizontal: 18, gap: 12 },
  featuredCard: { width: 140, borderRadius: 22, padding: 10 },
  featuredImage: { width: "100%", height: 120, borderRadius: 16, marginBottom: 8 },
  featuredTitle: { fontSize: 13, lineHeight: 17, fontFamily: "Inter_700Bold" },
  featuredArtist: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 3 },
  trackRow: { marginHorizontal: 18, marginBottom: 8, borderWidth: 1, borderRadius: 20, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  trackImage: { width: 52, height: 52, borderRadius: 14 },
  playingDot: { position: "absolute", bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: "rgba(255,244,223,0.9)", alignItems: "center", justifyContent: "center" },
  playingDotInner: { width: 6, height: 6, borderRadius: 3 },
  trackText: { flex: 1, minWidth: 0 },
  trackTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  trackArtist: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 3 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  empty: { margin: 18, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: "center" },
  emptyTitle: { marginTop: 10, fontSize: 17, fontFamily: "Inter_700Bold" },
  emptyText: { marginTop: 6, textAlign: "center", lineHeight: 20, fontFamily: "Inter_500Medium" },
  player: { position: "absolute", left: 12, right: 12, borderRadius: 10, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 20, elevation: 12 },
  playerImage: { width: 50, height: 50, borderRadius: 15 },
  playerInfo: { flex: 1, minWidth: 0 },
  playerTitle: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_700Bold" },
  playerArtist: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  playBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  progressMini: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: "hidden" },
  progressMiniFill: { height: 3 },
  bottomNav: { position: "absolute", left: 0, right: 0, bottom: 0, height: 76, borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingTop: 8, paddingBottom: 10 },
  bottomNavItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  bottomNavText: { fontSize: 10.5, fontFamily: "Inter_700Bold" },
});
