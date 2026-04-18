# Workspace

## Overview

This is a pnpm workspace monorepo. The active product is **Seif music**, a private Expo mobile music streaming app backed by an Express API, with a React/Vite web preview for Replit.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 20 in this Replit environment
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile app**: Expo / React Native
- **Web app**: React 19 / Vite 7
- **API framework**: Express 5
- **Validation**: Zod (`zod/v4`)
- **API codegen**: Orval from `lib/api-spec/openapi.yaml`
- **Build**: esbuild for API bundling

## Product Notes

- App name: Seif music
- Private login uses a shared password: `80808016`
- UI must not mention YouTube; music source details stay hidden from users.
- Palette lives in `artifacts/mobile/constants/colors.ts` — Spotify-style light/dark tokens with green primary, black/dark surfaces, and light-mode neutral cards.
- Music search uses `yt-search`. Audio streaming uses yt-dlp piped through ffmpeg → MP3 (audio/mpeg, 192k, 44100Hz stereo). Format is MP3 for universal mobile/browser compatibility.
- YouTube cookies stored as object array in `artifacts/api-server/src/secrets.ts` (compatible with `ytdl.createAgent`).
- **All user data (playlist, favorites) stored client-side in AsyncStorage** — no DB dependency for user data.
- `LocalMusicContext` in `artifacts/mobile/contexts/LocalMusicContext.tsx` manages all local state.
- `AudioPlayerContext` in `artifacts/mobile/contexts/AudioPlayerContext.tsx` manages shared audio player instance with queue/next/prev.
- Tab bar is hidden (`display: none`) — navigation handled via in-screen NavPill buttons.
- UI now uses a Spotify-style custom bottom navigation bar inside `artifacts/mobile/app/(tabs)/index.tsx`.
- Theme switching is manual via `ThemeContext` (`artifacts/mobile/contexts/ThemeContext.tsx`), with persisted light/dark mode; dark is black/Spotify green and light is white/Spotify green.
- Search history stored in AsyncStorage key `seif-search-history` (up to 10 entries).
- Device music tab uses `expo-media-library` to list phone audio files and play them locally.
- Device music only works in the native mobile app; web browsers cannot enumerate a user's local audio library for privacy/security reasons, so the web UI explains this limitation.
- Download uses `Linking.openURL()` — Chrome intent on Android, system browser fallback.
- Downloads preserve the song title in the generated filename and use `/api/music/stream/:videoId?download=1`; Android prioritizes opening the download URL in Google Chrome.
- Playlist/library screen includes a bulk-download action that loops through every saved library track.
- Player modal at `/player-modal` — full-screen Spotify-style, opened by tapping the mini player bar.
- Main scroll uses a single `FlatList` with `ListHeaderComponent` — lag-free scrolling.
- `vercel.json` in root for PWA/web deployment of the Expo web export. Run `pnpm --filter @workspace/mobile run build:web` to generate `dist/`.

## Replit Migration

- The Replit development workflow is `Start application`.
- It runs `scripts/start-replit-dev.sh`, which starts the API on port `8080` and the web app on port `3000`.
- The web app proxies `/api/*` to the local API server in development, keeping backend logic and private checks off the client.
- The API requires the `PORT` environment variable and fails explicitly if it is missing or invalid.

## Web App (React + Vite)

- **Path**: `artifacts/web/`
- **URL**: Preview at `/` (development workflow port `3000`; artifact metadata also supports port `22333`)
- **Stack**: React 19, Vite 7, TailwindCSS v4, TanStack Query
- **Splash animation**: Logo + animated rings + wave bars on black background
- **Features**: Login, Search, Library, Favorites, Audio Player with queue
- **State**: All user data (playlist, favorites, history) stored in `localStorage`
- **API proxy**: Vite dev server proxies `/api/*` → localhost:8080
- **Vercel deploy**: `vercel.json` at root configures build from pnpm workspace
  - Build: `pnpm --filter @workspace/web run build`
  - Output: `artifacts/web/dist/public`
  - API rewrites: `/api/*` → Replit backend URL (update URL in `vercel.json` after deploying backend)
- **Build**: `BASE_PATH=/ PORT=22333 pnpm --filter @workspace/web run build`

## Key Commands

- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/web run dev` — run React web app locally
- `pnpm --filter @workspace/mobile run dev` — run Expo mobile app
- `pnpm --filter @workspace/mobile run build:web` — build web/PWA export to `artifacts/mobile/dist/`
