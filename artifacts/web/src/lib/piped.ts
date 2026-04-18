const EXTERNAL_API = "https://c68167c1-9d98-42f1-9e56-fa1768e61a90-00-tvhwnarqg09z.worf.replit.dev";

export type PipedTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string | null;
  streamUrl: string;
};

export async function searchTracks(query: string): Promise<PipedTrack[]> {
  const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`البحث فشل: ${res.status}`);
  const data: PipedTrack[] = await res.json();
  return data;
}

export function resolveStreamUrl(videoId: string): Promise<string> {
  return Promise.resolve(`${EXTERNAL_API}/api/proxy?id=${videoId}`);
}
