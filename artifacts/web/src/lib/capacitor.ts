/* Capacitor runtime detection and plugin wrappers */

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      getPlatform: () => string;
      Plugins: Record<string, any>;
    };
  }
}

export function isCapacitor(): boolean {
  return typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
}

export function isAndroid(): boolean {
  return isCapacitor() && window.Capacitor!.getPlatform() === "android";
}

export function getCapPlugin<T = any>(name: string): T | null {
  if (!isCapacitor()) return null;
  return (window.Capacitor!.Plugins?.[name] as T) ?? null;
}
