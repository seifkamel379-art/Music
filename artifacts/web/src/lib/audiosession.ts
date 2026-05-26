/* Native Android Audio Session bridge
 * Calls AudioServicePlugin (Capacitor) to manage Foreground Service,
 * MediaSession, and NotificationCompat.MediaStyle notification.
 * On browser/non-Android: all calls are no-ops.
 */
import { isAndroid, getCapPlugin } from "./capacitor";

export type TransportControlEvent = {
  command: "play" | "pause" | "next" | "prev" | "stop" | "seek";
  position?: number; // ms, only for "seek"
};

type TransportCallback = (e: TransportControlEvent) => void;

let _cleanup: (() => void) | null = null;

function plugin() {
  return getCapPlugin<any>("AudioService");
}

function cap() {
  return isAndroid() && !!plugin();
}

// ──────────────────────────────────────────────────────────
// Session management
// ──────────────────────────────────────────────────────────

export async function startAudioSession(opts: {
  title: string;
  artist: string;
  thumbnail: string | null;
  playing: boolean;
  durationMs: number;
  positionMs: number;
}): Promise<void> {
  if (!cap()) return;
  try {
    await plugin().startSession({
      title:     opts.title,
      artist:    opts.artist,
      thumbnail: opts.thumbnail ?? "",
      playing:   opts.playing,
      duration:  opts.durationMs,
      position:  opts.positionMs,
    });
  } catch (e) {
    console.warn("[audiosession] startSession error:", e);
  }
}

export async function updateAudioMetadata(opts: {
  title: string;
  artist: string;
  thumbnail: string | null;
  durationMs: number;
}): Promise<void> {
  if (!cap()) return;
  try {
    await plugin().updateMetadata({
      title:     opts.title,
      artist:    opts.artist,
      thumbnail: opts.thumbnail ?? "",
      duration:  opts.durationMs,
    });
  } catch (e) {
    console.warn("[audiosession] updateMetadata error:", e);
  }
}

export async function updatePlaybackState(opts: {
  playing: boolean;
  positionMs: number;
  durationMs: number;
}): Promise<void> {
  if (!cap()) return;
  try {
    await plugin().updatePlaybackState({
      playing:  opts.playing,
      position: opts.positionMs,
      duration: opts.durationMs,
    });
  } catch (e) {
    console.warn("[audiosession] updatePlaybackState error:", e);
  }
}

export async function stopAudioSession(): Promise<void> {
  if (!cap()) return;
  try { await plugin().stopSession(); } catch (e) {
    console.warn("[audiosession] stopSession error:", e);
  }
}

// ──────────────────────────────────────────────────────────
// Transport control listener
// ──────────────────────────────────────────────────────────

export function addTransportListener(cb: TransportCallback): () => void {
  if (!cap()) return () => {};
  try {
    const p = plugin();
    // Capacitor v7 returns a handle with .remove()
    const handle = p.addListener("transportControl", (data: any) => {
      cb({ command: data.command, position: data.position });
    });
    return () => { try { handle?.remove?.(); } catch {} };
  } catch (e) {
    console.warn("[audiosession] addListener error:", e);
    return () => {};
  }
}
