#!/bin/bash
set -e

PORT=3001 pnpm --filter @workspace/api-server run dev &
api_pid=$!

PORT=8080 BASE_PATH=/ pnpm --filter @workspace/web run dev &
web_pid=$!

cleanup() {
  kill "$api_pid" "$web_pid" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

wait -n "$api_pid" "$web_pid"
status=$?
cleanup
exit "$status"
