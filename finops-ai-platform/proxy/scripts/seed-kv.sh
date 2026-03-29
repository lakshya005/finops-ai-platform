#!/usr/bin/env bash
# seed-kv.sh — Seeds the API_KEYS KV namespace with a local test record.
#
# Usage:
#   ./scripts/seed-kv.sh          # write to production KV
#   ./scripts/seed-kv.sh --local  # write to local dev KV (Miniflare)
#
# Before running against production you need the namespace ID.
# Find it by running:
#   npx wrangler kv namespace list
# or by looking at the [[kv_namespaces]] binding in wrangler.jsonc, e.g.:
#   [[kv_namespaces]]
#   binding = "API_KEYS"
#   id      = "abc123..."   <-- this is the namespace ID
#
# Set NAMESPACE_ID below (required for production; ignored for --local).

set -euo pipefail

NAMESPACE_ID="${NAMESPACE_ID:-REPLACE_WITH_NAMESPACE_ID}"
KEY="finops-test-key-abc123"
VALUE='{"orgId":"org_test_01","upstreamKey":"REPLACE_ME","provider":"openai","label":"local test org"}'

LOCAL_FLAG=""
if [[ "${1:-}" == "--local" ]]; then
  LOCAL_FLAG="--local"
  echo "[seed-kv] targeting local dev KV (Miniflare)"
else
  if [[ "$NAMESPACE_ID" == "REPLACE_WITH_NAMESPACE_ID" ]]; then
    echo "Error: set NAMESPACE_ID env var or edit this script before seeding production." >&2
    exit 1
  fi
  echo "[seed-kv] targeting production KV namespace: $NAMESPACE_ID"
fi

npx wrangler kv key put \
  --namespace-id="$NAMESPACE_ID" \
  $LOCAL_FLAG \
  "$KEY" \
  "$VALUE"

echo "[seed-kv] done — key '$KEY' written."
