#!/usr/bin/env bash
# Fetch an authenticated page from the running dev server as the demo user.
# Usage: scripts/fetch-page.sh /accounts   → prints HTTP status and saves HTML to /tmp/pt-page.html
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
JAR="${JAR:-/tmp/pt-cookies.txt}"
if [ ! -s "$JAR" ] || ! grep -q session_token "$JAR" 2>/dev/null; then
  curl -s -c "$JAR" -H "Content-Type: application/json" -H "Origin: $BASE" \
    -d '{"email":"demo@proptrack.test","password":"demo-password-123"}' "$BASE/api/auth/sign-in/email" > /dev/null
fi
OUT="${OUT:-/tmp/pt-page.html}"
code=$(curl -s -b "$JAR" -o "$OUT" -w "%{http_code}" "$BASE$1")
echo "$code $1 ($(wc -c < "$OUT") bytes → $OUT)"
# Surface Next.js error overlays / digests if present.
grep -o '"digest":"[^"]*"\|Unhandled Runtime Error\|Error: [^<"]\{0,200\}' "$OUT" | head -5 || true
