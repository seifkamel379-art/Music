---
name: yt-dlp Server IP Restrictions
description: yt-dlp from a server/datacenter IP fails for YouTube Music exclusive and SABR-only content.
---

## The Problem
From a server IP (Replit/GCP datacenter):
- yt-dlp fails with "The following content is not available on this app" for YT-Music exclusive tracks
- yt-dlp signature extraction can fail for new YouTube player versions (e.g., `c2f7551f`) with "Unable to extract Initial JS player signature function name"
- SABR streaming forces all formats to have no direct URL, so yt-dlp has nothing to extract

## What Works
- Regular YouTube videos (non-SABR, non-geo-restricted): yt-dlp returns HLS manifest URLs correctly
- YouTube IFrame API in the user's browser: always works regardless of content restrictions

## yt-dlp command in music.ts
Current fallback chain uses `spawn("yt-dlp", ...)` with format selectors:
1. `140/251/250/249/bestaudio/best` + `player_client=web_music`
2. `140/251/250/249/bestaudio/best` + `player_client=mweb`
3. `bestaudio/best` + `player_client=ios`
4. `bestaudio/best` (default)
5. `best` + `player_client=web_music`

## Installed version
nixpkgs: `yt-dlp 2025.06.30` — this IS the version on PATH. pip install goes to a different Python env and doesn't override it.
