/* YouTube IFrame Player API wrapper
 *
 * This is the ONLY reliable playback mechanism in production.
 * YouTube's embed API works from any IP — no cookies, no yt-dlp, no blocking.
 */

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
    _ytApiReady: boolean;
  }
}

export type PlayerState = "unstarted" | "buffering" | "playing" | "paused" | "ended" | "error";

export type PlayerEventMap = {
  stateChange: PlayerState;
  timeUpdate: { currentTime: number; duration: number };
  error: string;
};

type Listener<T> = (v: T) => void;

class YouTubeIframeService {
  private player: any = null;
  private containerId = "__yt_player_container__";
  private currentVideoId: string | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private apiLoaded = false;

  private stateListeners: Listener<PlayerState>[] = [];
  private timeListeners: Listener<{ currentTime: number; duration: number }>[] = [];
  private errorListeners: Listener<string>[] = [];

  on(event: "stateChange", cb: Listener<PlayerState>): () => void;
  on(event: "timeUpdate", cb: Listener<{ currentTime: number; duration: number }>): () => void;
  on(event: "error", cb: Listener<string>): () => void;
  on(event: string, cb: any): () => void {
    if (event === "stateChange") {
      this.stateListeners.push(cb);
      return () => { this.stateListeners = this.stateListeners.filter(l => l !== cb); };
    }
    if (event === "timeUpdate") {
      this.timeListeners.push(cb);
      return () => { this.timeListeners = this.timeListeners.filter(l => l !== cb); };
    }
    this.errorListeners.push(cb);
    return () => { this.errorListeners = this.errorListeners.filter(l => l !== cb); };
  }

  private emit(event: "stateChange", v: PlayerState): void;
  private emit(event: "timeUpdate", v: { currentTime: number; duration: number }): void;
  private emit(event: "error", v: string): void;
  private emit(event: string, v: any): void {
    if (event === "stateChange") this.stateListeners.forEach(l => l(v));
    else if (event === "timeUpdate") this.timeListeners.forEach(l => l(v));
    else this.errorListeners.forEach(l => l(v));
  }

  private ensureContainer(): HTMLDivElement {
    let el = document.getElementById(this.containerId) as HTMLDivElement | null;
    if (!el) {
      el = document.createElement("div");
      el.id = this.containerId;
      el.style.cssText = "position:fixed;width:1px;height:1px;top:-9999px;left:-9999px;opacity:0;pointer-events:none;";
      document.body.appendChild(el);
    }
    // Create inner div for the player
    const inner = document.createElement("div");
    inner.id = this.containerId + "_inner_" + Date.now();
    el.appendChild(inner);
    return inner as any;
  }

  loadAPI(): Promise<void> {
    if (this.apiLoaded && window.YT?.Player) return Promise.resolve();

    return new Promise(resolve => {
      const existing = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        this.apiLoaded = true;
        window._ytApiReady = true;
        existing?.();
        resolve();
      };

      if (window._ytApiReady && window.YT?.Player) {
        this.apiLoaded = true;
        resolve();
        return;
      }

      if (!document.querySelector('script[src*="iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
    });
  }

  async play(videoId: string): Promise<void> {
    await this.loadAPI();

    this.emit("stateChange", "buffering");
    this.stopPoll();

    if (this.player && this.currentVideoId === videoId) {
      this.player.seekTo(0);
      this.player.playVideo();
      return;
    }

    // Destroy old player
    if (this.player) {
      try { this.player.destroy(); } catch {}
      this.player = null;
    }

    this.currentVideoId = videoId;
    const inner = this.ensureContainer();

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("YouTube player load timeout"));
      }, 20000);

      this.player = new window.YT.Player(inner, {
        videoId,
        width: "1",
        height: "1",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (e: any) => {
            clearTimeout(timeout);
            e.target.playVideo();
            this.startPoll();
            resolve();
          },
          onStateChange: (e: any) => {
            const YT = window.YT;
            switch (e.data) {
              case YT.PlayerState.PLAYING:
                this.emit("stateChange", "playing");
                break;
              case YT.PlayerState.PAUSED:
                this.emit("stateChange", "paused");
                break;
              case YT.PlayerState.BUFFERING:
                this.emit("stateChange", "buffering");
                break;
              case YT.PlayerState.ENDED:
                this.emit("stateChange", "ended");
                this.stopPoll();
                break;
            }
          },
          onError: (e: any) => {
            clearTimeout(timeout);
            this.stopPoll();
            const msg = this.ytErrorMessage(e.data);
            this.emit("stateChange", "error");
            this.emit("error", msg);
            reject(new Error(msg));
          },
        },
      });
    });
  }

  private ytErrorMessage(code: number): string {
    const msgs: Record<number, string> = {
      2: "Invalid video ID",
      5: "Video cannot play in embedded player",
      100: "Video not found",
      101: "Embedding disabled by owner",
      150: "Embedding disabled by owner",
    };
    return msgs[code] ?? `YouTube error ${code}`;
  }

  pause(): void {
    if (this.player) {
      try { this.player.pauseVideo(); } catch {}
    }
  }

  resume(): void {
    if (this.player) {
      try { this.player.playVideo(); } catch {}
    }
  }

  seekTo(seconds: number): void {
    if (this.player) {
      try { this.player.seekTo(seconds, true); } catch {}
    }
  }

  getCurrentTime(): number {
    try { return this.player?.getCurrentTime?.() ?? 0; } catch { return 0; }
  }

  getDuration(): number {
    try { return this.player?.getDuration?.() ?? 0; } catch { return 0; }
  }

  getState(): PlayerState {
    if (!this.player) return "unstarted";
    try {
      const s = this.player.getPlayerState?.();
      const YT = window.YT;
      if (!YT) return "unstarted";
      if (s === YT.PlayerState.PLAYING) return "playing";
      if (s === YT.PlayerState.PAUSED) return "paused";
      if (s === YT.PlayerState.BUFFERING) return "buffering";
      if (s === YT.PlayerState.ENDED) return "ended";
    } catch {}
    return "unstarted";
  }

  setVolume(vol: number): void {
    try { this.player?.setVolume?.(Math.round(vol * 100)); } catch {}
  }

  stop(): void {
    this.stopPoll();
    if (this.player) {
      try { this.player.stopVideo(); } catch {}
    }
  }

  private startPoll(): void {
    this.stopPoll();
    this.pollInterval = setInterval(() => {
      if (!this.player) return;
      const ct = this.getCurrentTime();
      const dur = this.getDuration();
      if (isFinite(dur) && dur > 0) {
        this.emit("timeUpdate", { currentTime: ct, duration: dur });
      }
    }, 500);
  }

  private stopPoll(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

export const ytPlayer = new YouTubeIframeService();
