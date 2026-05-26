/* Resolves YouTube video ID → direct audio URL.
 * Primary:  Cloudflare Worker (VITE_WORKER_URL)
 * Fallback: Local API server /api/music/url/:videoId (Innertube + yt-dlp)
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
      signal: AbortSignal.timeout(15_000),
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
  const apiRes = await fetch(`/api/music/url/${encodeURIComponent(videoId)}`, {
    signal: AbortSignal.timeout(35_000),
  });
  if (!apiRes.ok) {
    const body = await apiRes.text().catch(() => "");
    throw new Error(`Stream unavailable (${apiRes.status}): ${body}`);
  }
  const data = await apiRes.json() as { url?: string; contentType?: string; message?: string };
  if (!data.url) throw new Error(data.message ?? "No stream URL available");

  const result: StreamResult = { url: data.url, contentType: data.contentType ?? "audio/webm" };
  urlCache.set(videoId, { result, expiresAt: Date.now() + 25 * 60 * 1000 });
  return result;
}

export function clearStreamCache(videoId?: string) {
  if (videoId) urlCache.delete(videoId);
  else urlCache.clear();
}
