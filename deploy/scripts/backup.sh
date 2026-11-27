#!/bin/sh
# Writes one logical dump of the platform database and deletes dumps older
# than the retention period. Run it daily; see docs/operations.md.
#
#   DATABASE_URL            the database to dump (required)
#   BACKUP_DIR              where dumps are kept (default /backups)
#   BACKUP_RETENTION_DAYS   how long they are kept (default 30)
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
backup_dir=${BACKUP_DIR:-/backups}
retention_days=${BACKUP_RETENTION_DAYS:-30}

mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dump="$backup_dir/shortener-$stamp.dump"
partial="$dump.partial"
# A dump that did not finish must never be mistaken for a backup.
trap 'rm -f "$partial"' EXIT

pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges \
  --file="$partial"
# Proves the file is a complete, readable archive before it counts.
pg_restore --list "$partial" >/dev/null
mv "$partial" "$dump"

# Monitoring reads this file's age: a stale one is a failed backup.
date -u +%s >"$backup_dir/last-success"

find "$backup_dir" -name 'shortener-*.dump' -type f \
  -mtime "+$retention_days" -exec rm -f {} +

echo "Backup written: $dump ($(du -h "$dump" | cut -f1))"
