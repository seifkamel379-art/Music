# Workspace

## Overview

This is a pnpm workspace monorepo. The active product is **Seif music**, a private Expo mobile music streaming app backed by an Express API and PostgreSQL.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile app**: Expo / React Native
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval from `lib/api-spec/openapi.yaml`
- **Build**: esbuild for API bundling

## Product Notes

- App name: Seif music
- Private login uses a shared password: `80808016`
- UI must not mention YouTube; music source details stay hidden from users.
- Palette lives in `artifacts/mobile/constants/colors.ts` and uses beige/brown luxury tones.
- Music search uses `play-dl` first with `yt-search` fallback.
- Audio streaming tries `play-dl` first and falls back to the system `yt-dlp` extractor, which is installed as a system dependency.
- `YOUTUBE_COOKIES` is available as a secret for providers that need authenticated extraction.
- Shared data tables are in `lib/db/src/schema/music.ts` for playlist, favorites, and synchronized player state.

## Key Commands

- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes in development
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/mobile run dev` — run Expo mobile app
