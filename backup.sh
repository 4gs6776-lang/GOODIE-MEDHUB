#!/usr/bin/env bash
# Backup + immediate check that the backup file is readable. FREE (pg_dump). Run daily via cron.
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"; DEST="${1:-./backups}"; mkdir -p "$DEST"
FILE="$DEST/medhub-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --file="$FILE" "$DATABASE_URL"
pg_restore --list "$FILE" > /dev/null && echo "Backup OK and readable: $FILE"
# Phase 1: encrypt (e.g. age/gpg) and copy to a 2nd disk + cloud.
