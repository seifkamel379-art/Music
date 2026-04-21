# Seif Music – Cloudflare Worker

Extracts YouTube audio URLs from Cloudflare's edge network.

## Deploy (5 minutes)

```bash
cd workers/youtube-resolver

# 1. Login to Cloudflare
npx wrangler login

# 2. Set a secret auth key (any random string you choose)
npx wrangler secret put AUTH_KEY

# 3. Deploy the worker
npx wrangler deploy
```

After deploy, you'll get a URL like:
`https://seif-music-resolver.YOUR-NAME.workers.dev`

## Connect to the app

In Replit, go to **Secrets** and add:
- `WORKER_URL` = `https://seif-music-resolver.YOUR-NAME.workers.dev`
- `WORKER_AUTH_KEY` = the same key you used in step 2

Then redeploy the app.

## Test

```bash
curl "https://seif-music-resolver.YOUR-NAME.workers.dev/health"
# → {"ok":true}

curl "https://seif-music-resolver.YOUR-NAME.workers.dev/url?id=dQw4w9WgXcQ&key=YOUR_KEY"
# → {"url":"https://...googlevideo.com/...","contentType":"audio/mp4","cached":false}
```

## Optional: Enable KV caching (faster repeated requests)

```bash
# Create a KV namespace
npx wrangler kv namespace create "URL_CACHE"

# Add the returned ID to wrangler.toml:
# [[kv_namespaces]]
# binding = "URL_CACHE"
# id = "PASTE_ID_HERE"

npx wrangler deploy
```
