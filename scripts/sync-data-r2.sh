#!/usr/bin/env bash
# Sync docs/data with the Cloudflare R2 bucket that serves the static JSON.
#
#   scripts/sync-data-r2.sh pull   # bucket -> docs/data
#   scripts/sync-data-r2.sh push   # docs/data -> bucket (never deletes remote files)
#
# Required env: R2_ACCOUNT_ID, R2_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# (the last two are an R2 API token's S3 credentials).
set -euo pipefail

: "${R2_ACCOUNT_ID:?}" "${R2_BUCKET:?}" "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="$ROOT/docs/data"
REMOTE="s3://$R2_BUCKET"
ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

export AWS_DEFAULT_REGION=auto
aws_r2() { aws --endpoint-url "$ENDPOINT" "$@"; }

case "${1:-}" in
  pull)
    mkdir -p "$LOCAL"
    aws_r2 s3 sync "$REMOTE" "$LOCAL" --only-show-errors
    ;;
  push)
    # Daily files are immutable once written; the small index files change every
    # run, so keep their cache short.
    aws_r2 s3 sync "$LOCAL" "$REMOTE" --only-show-errors \
      --cache-control "public, max-age=300"
    ;;
  *)
    echo "usage: $0 pull|push" >&2
    exit 2
    ;;
esac
