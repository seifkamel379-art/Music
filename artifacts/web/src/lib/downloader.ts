/* Download audio to device — uses Capacitor Filesystem on APK, blob on browser */

import { resolveStreamUrl } from "./streamer";
import { isCapacitor } from "./capacitor";

export type DownloadProgress = {
  phase: "resolving" | "downloading" | "saving" | "done" | "error";
  percent?: number;
  filePath?: string;
  error?: string;
};

type ProgressCallback = (p: DownloadProgress) => void;

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim().slice(0, 100) || "audio";
}

async function downloadBrowser(url: string, title: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(title)}.m4a`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function downloadCapacitor(url: string, title: string, onProgress: ProgressCallback) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem").catch(() => ({ Filesystem: null, Directory: null }));
  if (!Filesystem || !Directory) {
    await downloadBrowser(url, title);
    return;
  }

  const filename = `${sanitizeFilename(title)}.m4a`;

  try {
    await Filesystem.mkdir({ path: "seifoo", directory: Directory.ExternalStorage, recursive: true }).catch(() => {});
  } catch {}

  onProgress({ phase: "downloading", percent: 0 });

  const result = await Filesystem.downloadFile({
    url,
    path: `seifoo/${filename}`,
    directory: Directory.ExternalStorage,
    progress: true,
  } as any).catch(async () => {
    await downloadBrowser(url, title);
    return null;
  });

  if (!result) return;

  onProgress({ phase: "saving" });

  const { LocalNotifications } = await import("@capacitor/local-notifications").catch(() => ({ LocalNotifications: null }));
  if (LocalNotifications) {
    await LocalNotifications.requestPermissions().catch(() => {});
    await LocalNotifications.schedule({
      notifications: [{
        id: Date.now(),
        title: "تم التحميل ✓",
        body: `${title} — محفوظة في: Downloads/seifoo/`,
        smallIcon: "ic_notification",
        sound: undefined,
      }],
    }).catch(() => {});
  }

  onProgress({ phase: "done", filePath: `Downloads/seifoo/${filename}` });
}

export async function downloadTrack(
  videoId: string,
  title: string,
  localUrl: string | undefined,
  onProgress: ProgressCallback,
) {
  if (localUrl) {
    const a = document.createElement("a");
    a.href = localUrl;
    a.download = `${sanitizeFilename(title)}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onProgress({ phase: "done" });
    return;
  }

  try {
    onProgress({ phase: "resolving" });
    const { url } = await resolveStreamUrl(videoId);

    onProgress({ phase: "downloading", percent: 0 });

    if (isCapacitor()) {
      await downloadCapacitor(url, title, onProgress);
    } else {
      await downloadBrowser(url, title);
      onProgress({ phase: "done" });
    }
  } catch (e: any) {
    onProgress({ phase: "error", error: e?.message ?? "فشل التحميل" });
  }
}
