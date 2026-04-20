export function resolveAudioUrl(videoId: string): Promise<string> {
  return Promise.resolve(`/api/music/stream?id=${encodeURIComponent(videoId)}`);
}
