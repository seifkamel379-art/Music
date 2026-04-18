#!/bin/bash
set -euo pipefail

rm -rf artifacts/web/public/assets artifacts/web/public/index.html
rm -rf public/assets public/index.html

pnpm --filter @workspace/web run build

mkdir -p public
cp -R artifacts/web/dist/public/. public/

mkdir -p artifacts/web/public
cp -R artifacts/web/dist/public/. artifacts/web/public/

if [ ! -f public/index.html ]; then
  echo "Vercel build failed: public/index.html was not created" >&2
  exit 1
fi

if [ ! -f artifacts/web/public/index.html ]; then
  echo "Vercel build failed: artifacts/web/public/index.html was not created" >&2
  exit 1
fi
