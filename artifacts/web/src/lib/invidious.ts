const INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.io.lol",
  "https://invidious.nerdvpn.de",
  "https://iv.ggtyler.dev",
  "https://invidious.privacydev.net",
  "https://yt.artemislena.eu",
  "https://invidious.fdn.fr",
  "https://invidious.protokolla.fi",
];

async function tryInstance(instance: string, videoId: string): Promise<string | null> {
  const res = await fetch(
    `${instance}/api/v1/videos/${encodeURIComponent(videoId)}?fields=adaptiveFormats`,
    { signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) return null;
  const data = await res.json() as { adaptiveFormats?: Array<{ itag: number; type: string }> };
  const formats = data.adaptiveFormats ?? [];
  const mp4 = formats.find(f => f.type?.startsWith("audio/mp4"));
  const webm = formats.find(f => f.type?.startsWith("audio/webm"));
  const chosen = mp4 ?? webm;
  if (!chosen?.itag) return null;
  return `${instance}/latest_version?id=${encodeURIComponent(videoId)}&itag=${chosen.itag}`;
}

export async function resolveAudioUrl(videoId: string): Promise<string | null> {
  for (const instance of INSTANCES) {
    try {
      const url = await tryInstance(instance, videoId);
      if (url) {
        console.log(`[invidious] resolved via ${instance}`);
        return url;
      }
    } catch {
      continue;
    }
  }
  return null;
}
