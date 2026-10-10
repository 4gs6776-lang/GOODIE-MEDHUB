#!/usr/bin/env bash
# Restore a backup into an EMPTY database (use on a replacement server).
set -euo pipefail
FILE="${1:?backup file}"; : "${DATABASE_URL:?set DATABASE_URL}"
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$FILE" && echo "Restore finished."
