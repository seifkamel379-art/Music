/* Resolves YouTube video ID → direct audio URL.
 * Primary:  Cloudflare Worker (VITE_WORKER_URL)
 * Fallback: Local API server /api/music/url/:videoId (Innertube + yt-dlp)
 * Last resort: Return "yt:<videoId>" — player uses YouTube IFrame API via user's IP
 */

const WORKER_URL = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "https://seif-music-resolver.seifmusic.workers.dev";
const WORKER_KEY = (import.meta.env.VITE_WORKER_AUTH_KEY as string | undefined) ?? "";

export type StreamResult = {
  url: string;
  contentType: string;
};

const urlCache = new Map<string, { result: StreamResult; expiresAt: number }>();

export async function resolveStreamUrl(videoId: string): Promise<StreamResult> {
  const cached = urlCache.get(videoId);
  if (cached && Date.now() < cached.expiresAt) return cached.result;

  // ── Primary: Cloudflare Worker ────────────────────────────────────────────
  try {
    const params = new URLSearchParams({ id: videoId, key: WORKER_KEY });
    const res = await fetch(`${WORKER_URL}/url?${params}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      const data = await res.json() as { url?: string; contentType?: string; error?: string };
      if (data.url) {
        const result: StreamResult = { url: data.url, contentType: data.contentType ?? "audio/mp4" };
        urlCache.set(videoId, { result, expiresAt: Date.now() + 3 * 60 * 60 * 1000 });
        return result;
      }
    }
  } catch {
    // fall through to API server
  }

  // ── Fallback: API server (Innertube + yt-dlp) ────────────────────────────
  try {
    const apiRes = await fetch(`/api/music/url/${encodeURIComponent(videoId)}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (apiRes.ok) {
      const data = await apiRes.json() as { url?: string; contentType?: string; message?: string };
      if (data.url) {
        const result: StreamResult = { url: data.url, contentType: data.contentType ?? "audio/webm" };
        urlCache.set(videoId, { result, expiresAt: Date.now() + 25 * 60 * 1000 });
        return result;
      }
    }
  } catch {
    // fall through to YouTube IFrame fallback
  }

  // ── Last resort: YouTube IFrame API (uses user's browser IP, not server) ──
  // Return "yt:<videoId>" — AudioPlayerContext detects this and uses YT.Player
  const result: StreamResult = { url: `yt:${videoId}`, contentType: "youtube" };
  // Don't cache long — retry direct URL on next play attempt
  urlCache.set(videoId, { result, expiresAt: Date.now() + 5 * 60 * 1000 });
  return result;
}

export function clearStreamCache(videoId?: string) {
  if (videoId) urlCache.delete(videoId);
  else urlCache.clear();
}
