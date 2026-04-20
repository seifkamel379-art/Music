const INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.io.lol",
  "https://invidious.nerdvpn.de",
  "https://iv.ggtyler.dev",
];

type AdaptiveFormat = {
  itag: number;
  type: string;
  url: string;
};

async function tryInstance(instance: string, videoId: string): Promise<string | null> {
  const res = await fetch(
    `${instance}/api/v1/videos/${encodeURIComponent(videoId)}?fields=adaptiveFormats`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;

  const data = await res.json();
  const formats: AdaptiveFormat[] = data.adaptiveFormats ?? [];

  const mp4Audio = formats.find((f) => f.type?.startsWith("audio/mp4"));
  const webmAudio = formats.find((f) => f.type?.startsWith("audio/webm"));
  const chosen = mp4Audio ?? webmAudio;
  if (!chosen) return null;

  return `${instance}/latest_version?id=${encodeURIComponent(videoId)}&itag=${chosen.itag}`;
}

export async function resolveAudioUrl(videoId: string): Promise<string> {
  const errors: string[] = [];

  for (const instance of INSTANCES) {
    try {
      const url = await tryInstance(instance, videoId);
      if (url) return url;
      errors.push(`${instance}: no formats`);
    } catch (e: any) {
      errors.push(`${instance}: ${e?.message ?? "timeout"}`);
    }
  }

  throw new Error(`لم يتم العثور على رابط الصوت. (${errors.join(" | ")})`);
}
