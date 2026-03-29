#!/usr/bin/env bash
# smoke-test.sh — Sends a test chat completion request to the local proxy.
# Run `npx wrangler dev` first, then execute this script.

set -euo pipefail

BASE_URL="${BASE_URL:-https://proxy.mail-lakshyagupta.workers.dev}"
API_KEY="${API_KEY:-finops-test-key-abc123}"

echo "[smoke-test] POST $BASE_URL/openai/v1/chat/completions"
echo ""

response=$(curl --silent --write-out "\n---HTTP_STATUS:%{http_code}---" \
  --request POST \
  --url "$BASE_URL/openai/v1/chat/completions" \
  --header "Authorization: Bearer $API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "user", "content": "Say hello in one word." }
    ],
    "max_tokens": 16
  }')

body="${response%---HTTP_STATUS:*---}"
status="${response##*---HTTP_STATUS:}"
status="${status%---}"

echo "Status: $status"
echo ""
echo "Body:"
echo "$body" | (command -v jq > /dev/null 2>&1 && jq . || cat)
