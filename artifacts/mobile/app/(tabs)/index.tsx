import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  getGetFavoritesQueryKey,
  getGetPlayerStateQueryKey,
  getGetPlaylistQueryKey,
  getSearchTracksQueryKey,
  useAddToPlaylist,
  useGetFavorites,
  useGetPlayerState,
  useGetPlaylist,
  useMusicLogin,
  useRemoveFromPlaylist,
  useSearchTracks,
  useToggleFavorite,
  useUpdatePlayerState,
  type PlaylistTrack,
  type Track,
} from "@workspace/api-client-react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync, useAudioPlayerStatus } from "expo-audio";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/contexts/SessionContext";
import { useColors } from "@/hooks/useColors";

type Section = "home" | "search" | "playlist" | "favorites" | "device";
type AnyTrack = Track | PlaylistTrack;

type DeviceTrack = {
  id: string;
  filename: string;
  title: string;
  artist: string;
  duration: string;
  uri: string;
};

const domain = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
const quickSearches = ["اغاني مصرية", "عمرو دياب", "ويجز", "تامر حسني", "أم كلثوم", "راب مصري"];
const SEARCH_HISTORY_KEY = "seif-search-history";
const MAX_HISTORY = 10;

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
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function MusicScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("home");
  const [query, setQuery] = useState("اغاني مصرية");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<AnyTrack | null>(null);
  const [currentDeviceTrack, setCurrentDeviceTrack] = useState<DeviceTrack | null>(null);
  const [lastSyncedVideoId, setLastSyncedVideoId] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [deviceTracks, setDeviceTracks] = useState<DeviceTrack[]>([]);
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const playerRef = useRef(createAudioPlayer(null, { updateInterval: 500, keepAudioSessionActive: true }));
  const status = useAudioPlayerStatus(playerRef.current);

  useEffect(() => {
    AsyncStorage.getItem(SEARCH_HISTORY_KEY)
      .then((raw) => { if (raw) setSearchHistory(JSON.parse(raw)); })
      .catch(() => undefined);
  }, []);

  async function saveSearchHistory(term: string) {
    if (!term.trim() || term.trim().length < 2) return;
    const updated = [term, ...searchHistory.filter((h) => h !== term)].slice(0, MAX_HISTORY);
    setSearchHistory(updated);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated)).catch(() => undefined);
  }

  async function clearSearchHistory() {
    setSearchHistory([]);
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY).catch(() => undefined);
  }

  useEffect(() => {
    if (section !== "device") return;
    if (mediaPermission?.granted) {
      loadDeviceTracks();
    } else if (mediaPermission && !mediaPermission.granted && !mediaPermission.canAskAgain) {
      Alert.alert("تحتاج إذن", "افتح الإعدادات وأذن للتطبيق بالوصول للملفات الصوتية");
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
        first: 200,
        sortBy: MediaLibrary.SortBy.default,
      });
      const tracks: DeviceTrack[] = assets.map((asset) => ({
        id: asset.id,
        filename: asset.filename,
        title: asset.filename.replace(/\.[^/.]+$/, ""),
        artist: "جهازك",
        duration: formatDurationMs(asset.duration * 1000),
        uri: asset.uri,
      }));
      setDeviceTracks(tracks);
    } catch {
      Alert.alert("خطأ", "تعذّر تحميل الملفات الصوتية");
    }
  }

  const login = useMusicLogin({
    mutation: {
      onSuccess: async (data) => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await session.signIn(data.name);
        setLoginError(null);
      },
      onError: () => setLoginError("الباسورد غلط، جرّب تاني"),
    },
  });

  const playlist = useGetPlaylist({ query: { refetchInterval: 5000, queryKey: getGetPlaylistQueryKey() } });
  const favorites = useGetFavorites({ query: { refetchInterval: 6000, queryKey: getGetFavoritesQueryKey() } });
  const playerState = useGetPlayerState({ query: { refetchInterval: 3000, queryKey: getGetPlayerStateQueryKey() } });
  const search = useSearchTracks(
    { q: query },
    { query: { enabled: session.ready && !!session.name && query.trim().length > 1, queryKey: getSearchTracksQueryKey({ q: query }) } },
  );

  const addToPlaylist = useAddToPlaylist({
    mutation: {
      onSuccess: async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await queryClient.invalidateQueries({ queryKey: getGetPlaylistQueryKey() });
      },
    },
  });
  const removeFromPlaylist = useRemoveFromPlaylist({
    mutation: {
      onSuccess: async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await queryClient.invalidateQueries({ queryKey: getGetPlaylistQueryKey() });
      },
    },
  });
  const toggleFavorite = useToggleFavorite({
    mutation: {
      onSuccess: async () => {
        await Haptics.selectionAsync();
        await queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetPlaylistQueryKey() });
      },
    },
  });
  const updatePlayer = useUpdatePlayerState({
    mutation: {
      onSuccess: async () => queryClient.invalidateQueries({ queryKey: getGetPlayerStateQueryKey() }),
    },
  });

  const playlistTracks = playlist.data?.tracks ?? [];
  const favoriteTracks = favorites.data?.tracks ?? [];
  const searchTracks = search.data?.tracks ?? [];
  const allKnownTracks = useMemo(
    () => [...playlistTracks, ...favoriteTracks, ...searchTracks],
    [playlistTracks, favoriteTracks, searchTracks],
  );
  const featured = playlistTracks.length > 0 ? playlistTracks.slice(0, 6) : searchTracks.slice(0, 6);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      allowsRecording: false,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const remote = playerState.data;
    if (!remote?.currentVideoId || remote.currentVideoId === lastSyncedVideoId) return;
    const match = allKnownTracks.find((track) => track.videoId === remote.currentVideoId);
    if (!match || !remote.isPlaying) return;
    playTrack(match, false);
    setLastSyncedVideoId(remote.currentVideoId);
  }, [playerState.data?.currentVideoId, playerState.data?.isPlaying, allKnownTracks, lastSyncedVideoId]);

  async function submitLogin() {
    Keyboard.dismiss();
    if (!loginName.trim()) {
      setLoginError("اكتب اسمك الأول");
      return;
    }
    login.mutate({ data: { name: loginName.trim(), password } });
  }

  async function playTrack(track: AnyTrack, sync = true) {
    const url = getAbsoluteUrl(track.streamUrl);
    if (!url) return;
    setCurrentDeviceTrack(null);
    setCurrentTrack(track);
    try {
      playerRef.current.replace({ uri: url });
      playerRef.current.play();
      playerRef.current.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artist,
        album: "Seif music",
        artwork: track.thumbnail ?? undefined,
      });
      if (sync) {
        setLastSyncedVideoId(track.videoId);
        updatePlayer.mutate({ data: { currentVideoId: track.videoId, isPlaying: true, updatedBy: session.name ?? "Seif" } });
      }
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function playDeviceTrack(track: DeviceTrack) {
    setCurrentTrack(null);
    setCurrentDeviceTrack(track);
    try {
      playerRef.current.replace({ uri: track.uri });
      playerRef.current.play();
      playerRef.current.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artist,
        album: "Seif music",
      });
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  function pauseOrResume() {
    if (!currentTrack && !currentDeviceTrack) return;
    if (status.playing) {
      playerRef.current.pause();
      if (currentTrack) {
        updatePlayer.mutate({ data: { currentVideoId: currentTrack.videoId, isPlaying: false, updatedBy: session.name ?? "Seif" } });
      }
      return;
    }
    playerRef.current.play();
    if (currentTrack) {
      updatePlayer.mutate({ data: { currentVideoId: currentTrack.videoId, isPlaying: true, updatedBy: session.name ?? "Seif" } });
    }
  }

  function add(track: AnyTrack) {
    addToPlaylist.mutate({
      data: {
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        thumbnail: track.thumbnail ?? null,
        addedBy: session.name ?? "Seif",
      },
    });
  }

  function favorite(track: AnyTrack) {
    toggleFavorite.mutate({
      videoId: track.videoId,
      data: {
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        thumbnail: track.thumbnail ?? null,
        addedBy: session.name ?? "Seif",
      },
    });
  }

  async function downloadTrack(track: AnyTrack) {
    const safeTitle = track.title.replace(/[^\w\u0600-\u06FF\s\-]/g, "").trim().replace(/\s+/g, "_");
    const url = getAbsoluteUrl(`${track.streamUrl}?download=1&title=${encodeURIComponent(track.title)}`);
    if (!url) return;
    try {
      const dest = `${FileSystem.documentDirectory}${safeTitle || track.videoId}.mp3`;
      const res = await FileSystem.downloadAsync(url, dest);
      if (res.status === 200) {
        const { status: libStatus } = await MediaLibrary.requestPermissionsAsync();
        if (libStatus === "granted") {
          await MediaLibrary.createAssetAsync(res.uri);
          Alert.alert("تم التحميل", `تم حفظ "${track.title}" في مكتبتك`);
        } else {
          Alert.alert("تم التحميل", `الملف محفوظ: ${safeTitle}.mp3`);
        }
      }
    } catch {
      Alert.alert("خطأ في التحميل", "حاول مرة تانية");
    }
  }

  const activePlayerTrack = currentTrack
    ? { title: currentTrack.title, artist: currentTrack.artist, thumbnail: currentTrack.thumbnail ?? null }
    : currentDeviceTrack
    ? { title: currentDeviceTrack.title, artist: currentDeviceTrack.artist, thumbnail: null }
    : null;

  const listData: AnyTrack[] = useMemo(() => {
    if (section === "favorites") return favoriteTracks;
    if (section === "playlist") return playlistTracks;
    if (section === "home" || section === "search") return searchTracks;
    return [];
  }, [section, favoriteTracks, playlistTracks, searchTracks]);

  const renderNetworkItem = useCallback(
    ({ item, index }: { item: AnyTrack; index: number }) => (
      <TrackRow
        colors={colors}
        track={item}
        index={index}
        isCurrent={currentTrack?.videoId === item.videoId}
        onPlay={() => playTrack(item)}
        onAdd={() => add(item)}
        onFavorite={() => favorite(item)}
        onDownload={() => downloadTrack(item)}
        onRemove={section === "playlist" ? () => removeFromPlaylist.mutate({ videoId: item.videoId }) : undefined}
      />
    ),
    [currentTrack?.videoId, section, colors],
  );

  const renderDeviceItem = useCallback(
    ({ item }: { item: DeviceTrack }) => (
      <DeviceTrackRow
        colors={colors}
        track={item}
        isCurrent={currentDeviceTrack?.id === item.id}
        onPlay={() => playDeviceTrack(item)}
      />
    ),
    [currentDeviceTrack?.id, colors],
  );

  if (!session.ready) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!session.name) {
    return (
      <View style={[styles.loginShell, { backgroundColor: colors.espresso, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <View style={styles.loginGlow} />
        <View style={[styles.loginCard, { backgroundColor: colors.sand }]}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons name="music-clef-treble" size={38} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.loginTitle, { color: colors.foreground }]}>Seif music</Text>
          <Text style={[styles.loginSubtitle, { color: colors.mutedForeground }]}>مساحتك الخاصة للمزيكا والقوائم المشتركة</Text>
          <TextInput
            value={loginName}
            onChangeText={setLoginName}
            placeholder="اسمك"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            autoCapitalize="words"
            testID="name-input"
          />
          <TextInput
            value={password}
            onChangeText={(v) => { setPassword(v); setLoginError(null); }}
            placeholder="الباسورد"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderColor: loginError ? colors.destructive : colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            secureTextEntry
            testID="password-input"
          />
          {loginError ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "22", borderColor: colors.destructive + "55" }]}>
              <Feather name="alert-circle" size={15} color={colors.destructive} />
              <Text style={[styles.error, { color: colors.destructive }]}>{loginError}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={submitLogin}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 }]}
            testID="login-button"
          >
            {login.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>دخول</Text>}
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
          <Text style={[styles.title, { color: colors.foreground }]}>Seif music</Text>
          <Text style={[styles.welcome, { color: colors.mutedForeground }]}>أهلاً {session.name}، اختار اللي يسمع دلوقتي</Text>
        </View>
        <Pressable onPress={session.signOut} style={[styles.roundButton, { backgroundColor: colors.card }]}>
          <Feather name="log-out" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.espresso }]}>
        <View style={styles.heroText}>
          <Text style={[styles.heroLabel, { color: colors.gold }]}>قائمة مشتركة</Text>
          <Text style={styles.heroTitle}>{playlistTracks.length} أغنية جاهزة</Text>
          <Text style={styles.heroSub}>بحث سريع، مفضلة، تحميل، ومشغل متزامن</Text>
        </View>
        <Image source={require("@/assets/images/cover-one.png")} style={styles.heroImage} contentFit="cover" />
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={20} color={colors.primary} />
        <TextInput
          value={query}
          onChangeText={(value) => { setQuery(value); if (value.trim().length > 1) setSection("search"); }}
          onEndEditing={() => { if (query.trim().length > 1) saveSearchHistory(query.trim()); }}
          onSubmitEditing={() => { if (query.trim().length > 1) saveSearchHistory(query.trim()); }}
          placeholder="ابحث عن أي أغنية"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
          returnKeyType="search"
          testID="search-input"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={10}>
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {searchHistory.length > 0 && section !== "device" && (
        <View style={styles.historyRow}>
          <Text style={[styles.historyLabel, { color: colors.mutedForeground }]}>البحث السابق</Text>
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
            <Pressable
              key={item}
              onPress={() => { setQuery(item); setSection("search"); }}
              style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="clock" size={12} color={colors.mutedForeground} style={{ marginRight: 4 }} />
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
          <Pressable
            onPress={() => { setQuery(item); setSection("search"); saveSearchHistory(item); }}
            style={[styles.chip, { backgroundColor: query === item ? colors.primary : colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.chipText, { color: query === item ? colors.primaryForeground : colors.foreground }]}>{item}</Text>
          </Pressable>
        )}
      />

      <View style={styles.sectionTabs}>
        <NavPill colors={colors} active={section === "home"} label="الرئيسية" icon="home" onPress={() => setSection("home")} />
        <NavPill colors={colors} active={section === "search"} label="بحث" icon="search" onPress={() => setSection("search")} />
        <NavPill colors={colors} active={section === "playlist"} label="القائمة" icon="list" onPress={() => setSection("playlist")} />
        <NavPill colors={colors} active={section === "favorites"} label="المفضلة" icon="heart" onPress={() => setSection("favorites")} />
        <NavPill colors={colors} active={section === "device"} label="جهازي" icon="smartphone" onPress={() => setSection("device")} />
      </View>

      {section === "home" && (
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>مختارات سريعة</Text>
          <FlatList
            data={featured}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.videoId}
            contentContainerStyle={styles.featuredRow}
            renderItem={({ item, index }) => (
              <Pressable onPress={() => playTrack(item)} style={[styles.featuredCard, { backgroundColor: colors.card }]}>
                <Image source={item.thumbnail ? { uri: item.thumbnail } : getCover(index)} style={styles.featuredImage} contentFit="cover" />
                <Text numberOfLines={2} style={[styles.featuredTitle, { color: colors.foreground }]}>{item.title}</Text>
                <Text numberOfLines={1} style={[styles.trackArtist, { color: colors.mutedForeground }]}>{item.artist}</Text>
              </Pressable>
            )}
          />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>نتائج البحث</Text>
        </View>
      )}

      {section !== "home" && section !== "device" && (
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {section === "playlist" ? "القائمة المشتركة" : section === "favorites" ? "الأغاني المفضلة" : "نتائج البحث"}
        </Text>
      )}

      {section === "device" && (
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>موسيقى جهازك</Text>
      )}

      {search.isFetching && section !== "playlist" && section !== "favorites" && section !== "device" ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : null}
    </View>
  );

  if (section === "device") {
    return (
      <View style={[styles.shell, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <FlatList
          data={deviceTracks}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={headerComponent}
          ListEmptyComponent={
            <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="smartphone" size={28} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {!mediaPermission?.granted ? "محتاج إذن للملفات" : "مفيش ملفات صوتية"}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {!mediaPermission?.granted ? "اضغط على جهازي مرة تانية لطلب الإذن" : "ضيف ملفات موسيقى على جهازك"}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: activePlayerTrack ? 172 : 96 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={8}
          renderItem={renderDeviceItem}
        />
        {activePlayerTrack ? <PlayerBar colors={colors} track={activePlayerTrack} status={status} onPress={pauseOrResume} insets={insets} /> : null}
      </View>
    );
  }

  return (
    <View style={[styles.shell, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <FlatList
        data={listData}
        keyExtractor={(item) => item.videoId}
        ListHeaderComponent={headerComponent}
        ListEmptyComponent={<EmptyState colors={colors} section={section} />}
        contentContainerStyle={{ paddingBottom: activePlayerTrack ? 172 : 96 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={8}
        refreshControl={
          <RefreshControl
            refreshing={playlist.isRefetching || favorites.isRefetching || search.isRefetching}
            onRefresh={() => { playlist.refetch(); favorites.refetch(); search.refetch(); }}
          />
        }
        renderItem={renderNetworkItem}
      />
      {activePlayerTrack ? <PlayerBar colors={colors} track={activePlayerTrack} status={status} onPress={pauseOrResume} insets={insets} /> : null}
    </View>
  );
}

function NavPill({ active, label, icon, onPress, colors }: { active: boolean; label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <Pressable onPress={onPress} style={[styles.navPill, { backgroundColor: active ? colors.primary : colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={15} color={active ? colors.primaryForeground : colors.primary} />
      <Text style={[styles.navText, { color: active ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ section, colors }: { section: Section; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Feather name="music" size={28} color={colors.primary} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        {section === "favorites" ? "لسه مفيش مفضلة" : section === "playlist" ? "القائمة فاضية" : "ابدأ البحث"}
      </Text>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>دور على الأغاني وضيفها للقائمة المشتركة أو المفضلة.</Text>
    </View>
  );
}

function TrackRow({ track, index, isCurrent, onPlay, onAdd, onFavorite, onDownload, onRemove, colors }: {
  track: AnyTrack;
  index: number;
  isCurrent: boolean;
  onPlay: () => void;
  onAdd: () => void;
  onFavorite: () => void;
  onDownload: () => void;
  onRemove?: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable onPress={onPlay} style={[styles.trackRow, { backgroundColor: isCurrent ? colors.secondary : colors.card, borderColor: colors.border }]}>
      <Image source={track.thumbnail ? { uri: track.thumbnail } : getCover(index)} style={styles.trackImage} contentFit="cover" />
      <View style={styles.trackText}>
        <Text numberOfLines={1} style={[styles.trackTitle, { color: colors.foreground }]}>{track.title}</Text>
        <Text numberOfLines={1} style={[styles.trackArtist, { color: colors.mutedForeground }]}>{track.artist} · {track.duration}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onFavorite} hitSlop={10}><Feather name="heart" size={18} color={colors.primary} /></Pressable>
        <Pressable onPress={onAdd} hitSlop={10}><Feather name="plus-circle" size={18} color={colors.primary} /></Pressable>
        <Pressable onPress={onDownload} hitSlop={10}><Feather name="download" size={18} color={colors.primary} /></Pressable>
        {onRemove ? <Pressable onPress={onRemove} hitSlop={10}><Feather name="trash-2" size={18} color={colors.destructive} /></Pressable> : null}
      </View>
    </Pressable>
  );
}

function DeviceTrackRow({ track, isCurrent, onPlay, colors }: {
  track: DeviceTrack;
  isCurrent: boolean;
  onPlay: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable onPress={onPlay} style={[styles.trackRow, { backgroundColor: isCurrent ? colors.secondary : colors.card, borderColor: colors.border }]}>
      <View style={[styles.trackImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", borderRadius: 16 }]}>
        <Feather name="music" size={22} color={colors.primary} />
      </View>
      <View style={styles.trackText}>
        <Text numberOfLines={1} style={[styles.trackTitle, { color: colors.foreground }]}>{track.title}</Text>
        <Text numberOfLines={1} style={[styles.trackArtist, { color: colors.mutedForeground }]}>{track.artist} · {track.duration}</Text>
      </View>
      <Ionicons name={isCurrent ? "pause-circle" : "play-circle"} size={32} color={colors.primary} />
    </Pressable>
  );
}

function PlayerBar({ track, status, onPress, insets, colors }: {
  track: { title: string; artist: string; thumbnail: string | null };
  status: ReturnType<typeof useAudioPlayerStatus>;
  onPress: () => void;
  insets: ReturnType<typeof useSafeAreaInsets>;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.player, { backgroundColor: colors.espresso, paddingBottom: Math.max(insets.bottom, Platform.OS === "web" ? 34 : 10) }]}>
      {track.thumbnail ? (
        <Image source={{ uri: track.thumbnail }} style={styles.playerImage} contentFit="cover" />
      ) : (
        <View style={[styles.playerImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", borderRadius: 17 }]}>
          <Feather name="music" size={22} color={colors.primary} />
        </View>
      )}
      <View style={styles.playerInfo}>
        <Text numberOfLines={1} style={styles.playerTitle}>{track.title}</Text>
        <Text numberOfLines={1} style={styles.playerArtist}>{status.isBuffering ? "تحميل الصوت..." : track.artist}</Text>
      </View>
      <Pressable onPress={onPress} style={[styles.playButton, { backgroundColor: colors.gold }]}>
        <Ionicons name={status.playing ? "pause" : "play"} size={22} color={colors.espresso} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loginShell: { flex: 1, justifyContent: "center", padding: 22, overflow: "hidden" },
  loginGlow: { position: "absolute", width: 340, height: 340, borderRadius: 170, backgroundColor: "rgba(215,164,95,0.28)", top: 70, right: -120 },
  loginCard: { borderRadius: 34, padding: 24, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 24, elevation: 8 },
  logoCircle: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  loginTitle: { fontSize: 38, fontFamily: "Inter_700Bold", letterSpacing: -1.3 },
  loginSubtitle: { fontSize: 15, fontFamily: "Inter_500Medium", marginTop: 8, marginBottom: 22, lineHeight: 22 },
  input: { height: 56, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 16, fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  error: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  primaryButton: { height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center", marginTop: 6 },
  primaryButtonText: { fontSize: 17, fontFamily: "Inter_700Bold" },
  shell: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.4 },
  title: { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1.2 },
  welcome: { marginTop: 4, fontSize: 14, fontFamily: "Inter_500Medium" },
  roundButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  hero: { marginHorizontal: 18, borderRadius: 30, padding: 18, minHeight: 158, flexDirection: "row", overflow: "hidden" },
  heroText: { flex: 1, justifyContent: "center", zIndex: 1 },
  heroLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  heroTitle: { color: "#fff4df", fontSize: 27, fontFamily: "Inter_700Bold", marginTop: 6, letterSpacing: -0.6 },
  heroSub: { color: "rgba(255,244,223,0.72)", fontSize: 13, lineHeight: 19, marginTop: 8, fontFamily: "Inter_500Medium" },
  heroImage: { position: "absolute", width: 154, height: 154, borderRadius: 28, right: -18, bottom: -18, opacity: 0.82 },
  searchBox: { marginHorizontal: 18, marginTop: 18, height: 56, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, height: 54, fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  historyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 2 },
  historyLabel: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5 },
  historyClear: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  chips: { gap: 10, paddingHorizontal: 18, paddingVertical: 10 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 10, flexDirection: "row", alignItems: "center" },
  chipText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  sectionTabs: { paddingHorizontal: 18, flexDirection: "row", gap: 8, flexWrap: "wrap", paddingTop: 6 },
  navPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  navText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  sectionTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginHorizontal: 18, marginTop: 24, marginBottom: 12 },
  featuredRow: { paddingHorizontal: 18, gap: 14 },
  featuredCard: { width: 148, borderRadius: 24, padding: 10 },
  featuredImage: { width: "100%", height: 128, borderRadius: 18, marginBottom: 10 },
  featuredTitle: { fontSize: 14, lineHeight: 18, fontFamily: "Inter_700Bold" },
  trackRow: { marginHorizontal: 18, marginBottom: 10, borderWidth: 1, borderRadius: 22, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  trackImage: { width: 54, height: 54, borderRadius: 16 },
  trackText: { flex: 1, minWidth: 0 },
  trackTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  trackArtist: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 9 },
  empty: { marginHorizontal: 18, borderRadius: 24, borderWidth: 1, padding: 22, alignItems: "center" },
  emptyTitle: { marginTop: 10, fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { marginTop: 6, textAlign: "center", lineHeight: 20, fontFamily: "Inter_500Medium" },
  player: { position: "absolute", left: 12, right: 12, bottom: 8, borderRadius: 28, paddingTop: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 18, elevation: 10 },
  playerImage: { width: 54, height: 54, borderRadius: 17 },
  playerInfo: { flex: 1, minWidth: 0 },
  playerTitle: { color: "#fff4df", fontSize: 15, fontFamily: "Inter_700Bold" },
  playerArtist: { color: "rgba(255,244,223,0.72)", fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 3 },
  playButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
});
