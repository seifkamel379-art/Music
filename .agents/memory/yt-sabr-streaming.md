---
name: YouTube SABR Streaming
description: YT-Music exclusive tracks use SABR protocol — fmt.url is undefined on ALL clients; server-IP-based yt-dlp fails; browser IFrame API is the solution.
---

## The Problem
Artists like حمو المرشدي distribute exclusively via YouTube Music with SABR (Server-Abusive Bandwidth Reduction) streaming protocol:
- `fmt.url` is `undefined` for ALL adaptive formats, ALL Innertube clients (WEB, ANDROID, IOS, TVHTML5, etc.)
- `streaming_data.server_abr_streaming_url` IS set but returns 403 with `Content-Type: application/vnd.yt-ump` — proprietary protocol, not directly playable
- `hls_manifest_url` and `dash_manifest_url` are both `undefined` for these tracks
- yt-dlp fails with "not available on this app" because no direct URL formats are available

**Why:** YouTube Music restricts content to its own SABR streaming protocol from server IPs. Residential/browser IPs bypass this restriction.

**How to apply:** When the API server returns 503 for `/api/music/url/:videoId`, the `streamer.ts` returns `{ url: "yt:VIDEO_ID", contentType: "youtube" }`. `AudioPlayerContext` detects the `yt:` prefix and uses YouTube IFrame API (which runs in the user's browser using their IP) instead of `<audio>` element.
