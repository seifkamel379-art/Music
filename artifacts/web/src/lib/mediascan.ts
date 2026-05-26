/* MediaScan Capacitor Plugin wrapper
 * Works on Android APK only — in browser returns empty list.
 */
import { isCapacitor } from "./capacitor";

export type MediaTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  uri: string;
  path: string;
};

export async function scanAllDeviceAudio(): Promise<MediaTrack[]> {
  if (!isCapacitor()) return [];

  const cap = (window as any).Capacitor;
  const plugin = cap?.Plugins?.MediaScan;
  if (!plugin) {
    console.warn("[mediascan] MediaScan plugin not available");
    return [];
  }

  try {
    const result = await plugin.getAllAudioFiles();
    return (result?.tracks ?? []) as MediaTrack[];
  } catch (e: any) {
    if (e?.message?.includes("PERMISSION_DENIED")) {
      throw new Error("تم رفض إذن الوصول للموسيقى");
    }
    throw new Error(e?.message ?? "فشل مسح أغاني الجهاز");
  }
}
