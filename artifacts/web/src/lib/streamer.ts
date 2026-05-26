/* Resolves YouTube video ID → direct audio URL via Cloudflare Worker */

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

  const params = new URLSearchParams({ id: videoId, key: WORKER_KEY });
  const res = await fetch(`${WORKER_URL}/url?${params}`, {
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Worker ${res.status}: ${body}`);
  }

  const data = await res.json() as { url?: string; contentType?: string; error?: string };
  if (!data.url) throw new Error(data.error ?? "No URL from Worker");

  const result: StreamResult = {
    url: data.url,
    contentType: data.contentType ?? "audio/mp4",
  };

  urlCache.set(videoId, { result, expiresAt: Date.now() + 3 * 60 * 60 * 1000 });
  return result;
}

export function clearStreamCache(videoId?: string) {
  if (videoId) urlCache.delete(videoId);
  else urlCache.clear();
}
