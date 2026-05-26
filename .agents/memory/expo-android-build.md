---
name: Expo Android APK Build Setup
description: How the GitHub Actions APK build is configured for the Expo mobile app in artifacts/mobile/.
---

## Architecture
- Mobile app: `artifacts/mobile/` — Expo 54 / React Native 0.81.5 / New Architecture enabled
- Build approach: `expo prebuild --platform android` then Gradle `assembleRelease`
- `android/` and `ios/` are gitignored — regenerated every CI run by prebuild

## Key files
- `.github/workflows/build-apk.yml` — GitHub Actions CI pipeline
- `artifacts/mobile/app.json` — android.package: `com.seifmusic.app`, expo-audio plugin, all permissions
- `artifacts/mobile/metro.config.js` — monorepo watchFolders + nodeModulesPaths for `@workspace/*` resolution
- `artifacts/mobile/eas.json` — EAS build config (preview=apk, production=aab)
- `artifacts/mobile/babel.config.js` — includes `react-native-worklets/plugin` for Reanimated v4 native builds

## Critical requirements
1. `react-native-worklets/plugin` MUST be in babel.config.js — Reanimated v4 uses worklets which need this babel transform for native/Hermes builds
2. `metro.config.js` MUST configure `watchFolders` and `nodeModulesPaths` to include workspace root — otherwise `@workspace/api-client-react` won't resolve during Gradle bundle step
3. `EXPO_PUBLIC_DOMAIN` must be set in BOTH the prebuild step AND the assembleRelease step — it gets baked into the JS bundle during Gradle

## Keystore strategy
- If `secrets.ANDROID_KEYSTORE_BASE64` is set → uses stored keystore (consistent signing)
- Otherwise → generates ephemeral keystore on the fly (works for sideloading)

## EXPO_PUBLIC_DOMAIN
Value: `youtube-stream-api--seifmusic7.replit.app`
This is the Replit API backend. Also hardcoded as `EXTERNAL_API` in `index.tsx` for downloads.

**Why:** The API URL is baked into the JS bundle at build time. Must match the deployed Replit backend URL.
