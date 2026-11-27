#!/bin/sh
# Restores a logical dump written by backup.sh. See docs/operations.md.
#
#   restore.sh <dump file>
#
#   RESTORE_DATABASE_URL   the database to restore into (required). It must
#                          be empty, and it is deliberately not DATABASE_URL:
#                          restoring over live data is never the default.
set -eu

dump=${1:?usage: restore.sh <dump file>}
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"

if [ ! -r "$dump" ]; then
  echo "Cannot read dump file: $dump" >&2
  exit 1
fi

tables=$(psql --dbname="$RESTORE_DATABASE_URL" --no-psqlrc --tuples-only \
  --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")

if [ "$tables" != "0" ]; then
  echo "The target database already has $tables tables." >&2
  echo "Restore into a new, empty database." >&2
  exit 1
fi

# One transaction: the target ends up fully restored or untouched.
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner --no-privileges \
  --single-transaction --exit-on-error "$dump"

links=$(psql --dbname="$RESTORE_DATABASE_URL" --no-psqlrc --tuples-only \
  --no-align --set=ON_ERROR_STOP=1 --command="SELECT count(*) FROM links")
echo "Restore complete: $links links in the restored database."
