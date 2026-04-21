/**
 * Seif Music – Cloudflare Worker: YouTube Audio Resolver
 *
 * Extracts direct audio URLs from YouTube using youtubei.js running on
 * Cloudflare's edge network. Edge IPs are rarely blocked by YouTube.
 *
 * Endpoints:
 *   GET /url?id=VIDEO_ID          → { url, contentType, expiresAt }
 *   GET /health                   → { ok: true }
 *
 * Auth: Set an AUTH_KEY secret with `wrangler secret put AUTH_KEY`.
 *   Pass it via header:  X-Auth-Key: <key>
 *   Or query param:      ?key=<key>
 *
 * Deploy:
 *   cd workers/youtube-resolver
 *   npm install
 *   wrangler secret put AUTH_KEY
 *   wrangler deploy
 */

import { Innertube } from "youtubei.js";

export interface Env {
  AUTH_KEY?: string;
  URL_CACHE?: KVNamespace;
}

/* ── Module-level client (reused across requests in same isolate) ───────── */
let _client: Innertube | null = null;
let _clientTs = 0;
const CLIENT_TTL = 50 * 60 * 1000; // 50 min

async function getClient(): Promise<Innertube> {
  if (_client && Date.now() - _clientTs < CLIENT_TTL) return _client;
  _client = await Innertube.create({ generate_session_locally: true });
  _clientTs = Date.now();
  return _client;
}

/* ── Resolve audio URL using multiple clients ────────────────────────────── */
const CLIENTS = ["IOS", "ANDROID", "TV_EMBEDDED"] as const;

async function resolveAudioUrl(videoId: string): Promise<{ url: string; contentType: string } | null> {
  const yt = await getClient();

  for (const clientType of CLIENTS) {
    try {
      const info = await yt.getBasicInfo(videoId, clientType);
      const formats: any[] = (info.streaming_data?.adaptive_formats ?? []) as any[];

      const audioFmts = formats.filter(
        (f: any) =>
          f.has_audio &&
          !f.has_video &&
          typeof f.url === "string" &&
          (f.url as string).startsWith("http"),
      );

      if (audioFmts.length === 0) continue;

      const best = audioFmts.sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
      const mime: string = best.mime_type ?? "audio/mp4";
      const contentType = mime.split(";")[0].trim();

      return { url: best.url as string, contentType };
    } catch {
      continue;
    }
  }

  return null;
}

/* ── Cache helpers (KV optional) ─────────────────────────────────────────── */
const CACHE_TTL_SEC = 4 * 60 * 60; // 4 hours

async function getCached(env: Env, videoId: string): Promise<{ url: string; contentType: string } | null> {
  if (!env.URL_CACHE) return null;
  try {
    const raw = await env.URL_CACHE.get(`url:${videoId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) return null;
    return { url: parsed.url, contentType: parsed.contentType };
  } catch {
    return null;
  }
}

async function setCached(env: Env, videoId: string, url: string, contentType: string): Promise<void> {
  if (!env.URL_CACHE) return;
  try {
    await env.URL_CACHE.put(
      `url:${videoId}`,
      JSON.stringify({ url, contentType, expiresAt: Date.now() + CACHE_TTL_SEC * 1000 }),
      { expirationTtl: CACHE_TTL_SEC },
    );
  } catch {}
}

/* ── Auth check ──────────────────────────────────────────────────────────── */
function isAuthorized(request: Request, env: Env, url: URL): boolean {
  if (!env.AUTH_KEY) return true;
  const headerKey = request.headers.get("X-Auth-Key");
  const queryKey = url.searchParams.get("key");
  return headerKey === env.AUTH_KEY || queryKey === env.AUTH_KEY;
}

/* ── CORS headers ────────────────────────────────────────────────────────── */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "X-Auth-Key, Content-Type",
  };
}

/* ── Main handler ────────────────────────────────────────────────────────── */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true }, { headers: corsHeaders() });
    }

    if (url.pathname !== "/url") {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders() });
    }

    if (!isAuthorized(request, env, url)) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
    }

    const videoId = url.searchParams.get("id")?.trim();
    if (!videoId) {
      return Response.json({ error: "Missing id parameter" }, { status: 400, headers: corsHeaders() });
    }

    /* Check KV cache first */
    const cached = await getCached(env, videoId);
    if (cached) {
      return Response.json(
        { url: cached.url, contentType: cached.contentType, cached: true },
        { headers: { ...corsHeaders(), "Cache-Control": "public, max-age=3600" } },
      );
    }

    /* Resolve from YouTube */
    const result = await resolveAudioUrl(videoId);
    if (!result) {
      return Response.json(
        { error: "Could not extract audio URL from YouTube" },
        { status: 503, headers: corsHeaders() },
      );
    }

    /* Store in KV */
    await setCached(env, videoId, result.url, result.contentType);

    return Response.json(
      { url: result.url, contentType: result.contentType, cached: false },
      { headers: { ...corsHeaders(), "Cache-Control": "public, max-age=3600" } },
    );
  },
} satisfies ExportedHandler<Env>;
