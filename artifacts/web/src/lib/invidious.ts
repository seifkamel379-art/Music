/* Audio URL resolver
 * Strategy:
 *  1. Ask server for a direct CDN URL (server uses android_vr yt-dlp client)
 *  2. If server fails, try Invidious instances directly from browser
 *  3. If all fail, return null → caller falls back to /api/music/stream proxy
 */

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.io.lol",
  "https://invidious.nerdvpn.de",
  "https://iv.ggtyler.dev",
  "https://invidious.privacydev.net",
  "https://yt.artemislena.eu",
  "https://invidious.fdn.fr",
  "https://invidious.protokolla.fi",
];

async function tryServerUrl(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/music/url?id=${encodeURIComponent(videoId)}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { url?: string };
    if (data.url && data.url.startsWith("http")) {
      console.log("[audio] resolved CDN URL via server");
      return data.url;
    }
    return null;
  } catch {
    return null;
  }
}

async function tryInvidiousInstance(instance: string, videoId: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `${instance}/api/v1/videos/${encodeURIComponent(videoId)}?fields=adaptiveFormats`,
      { signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = await res.json() as { adaptiveFormats?: Array<{ itag: number; type: string; url?: string; bitrate?: number }> };
    const formats = data.adaptiveFormats ?? [];
    const audio = formats
      .filter(f => (f.type?.startsWith("audio/mp4") || f.type?.startsWith("audio/webm")) && f.url)
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    if (audio.length > 0 && audio[0].url) {
      console.log(`[audio] resolved direct URL via Invidious ${instance}`);
      return audio[0].url;
    }
    const mp4 = formats.find(f => f.type?.startsWith("audio/mp4"));
    const webm = formats.find(f => f.type?.startsWith("audio/webm"));
    const chosen = mp4 ?? webm;
    if (!chosen?.itag) return null;
    return `${instance}/latest_version?id=${encodeURIComponent(videoId)}&itag=${chosen.itag}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryAllInvidious(videoId: string): Promise<string | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    const url = await tryInvidiousInstance(instance, videoId);
    if (url) return url;
  }
  return null;
}

export async function resolveAudioUrl(videoId: string): Promise<string | null> {
  const serverUrl = await tryServerUrl(videoId);
  if (serverUrl) return serverUrl;

  console.warn("[audio] server URL failed, trying Invidious");
  return tryAllInvidious(videoId);
}
