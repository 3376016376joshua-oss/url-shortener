# Operations runbook

How to deploy, watch, back up, and restore the platform in production.
The requirements behind every number here are in [the PRD](PRD.md), section 13.

All commands run from the repository root on the production host.
They share one prefix, written `dc` below:

```sh
dc() {
  docker compose --env-file deploy/production.env \
    --file deploy/docker-compose.production.yml "$@"
}
```

## The stack

| Container    | Role                                                                          | Copies         |
| ------------ | ----------------------------------------------------------------------------- | -------------- |
| `edge`       | Caddy. The only public entry point: TLS, the dashboard, routing by host       | 1              |
| `api-web`    | Redirects and the management API (`PROCESS_ROLE=web`)                         | 2 or more      |
| `api-worker` | The click consumer and scheduled jobs (`PROCESS_ROLE=worker`)                 | 1 or more      |
| `redis`      | Cache, rate limits, click stream. Append-only file, `volatile-lru`            | 1              |
| `migrate`    | Applies pending migrations, then exits                                        | Once a release |
| `postgres`   | Only with `--profile postgres`. Otherwise Postgres is a managed service       | 0 or 1         |
| `backup`     | Only with `--profile tools`. The Postgres client tools, for the scripts below | On demand      |

Only `edge` publishes ports (80 and 443).
Everything else is reachable on the Compose network `shortener_internal` alone.

## Deploy

### First time

1. Point DNS at the host: the app host, the default short domain, and the CNAME target.
2. Create the configuration and fill it in. It holds secrets and is ignored by git.

   ```sh
   cp deploy/production.env.example deploy/production.env
   ```

3. Put a MaxMind-format country database at `deploy/geoip/country.mmdb`.
   Without it the platform still runs and records clicks with country `ZZ`.
4. Start the stack. Migrations run first, and the API starts only if they succeed.

   ```sh
   dc up --detach --wait
   ```

5. Check it, from inside the network because operational endpoints are not public:

   ```sh
   dc exec api-web wget -qO- http://127.0.0.1:3000/health/ready
   # {"status":"ok","checks":{"postgres":"up","redis":"up"}}
   ```

To run Postgres on this host instead of a managed service, set `POSTGRES_PASSWORD` and the matching `DATABASE_URL`, point `WAL_ARCHIVE_DIR` at storage that is not this host's disk, and add `--profile postgres` to every `dc` command.

### A release

Migrations are backward compatible with the previous version, so the order is always migrate, then replace the replicas.

```sh
# Set API_IMAGE and EDGE_IMAGE in deploy/production.env to the new tags, then:
dc pull
dc run --rm migrate
dc up --detach --wait --no-deps api-web api-worker edge
```

Any replica can serve any request, so a release is only replacing replicas.
Compose recreates them in turn without waiting for each to become healthy, which on a single host can mean a few seconds of refused requests.

### Roll back

Set the image tags back and run the same `dc up` line.
Do not roll migrations back: the previous version runs against the newer schema by design.

### Scale

Set `WEB_REPLICAS` or `WORKER_REPLICAS` in `deploy/production.env` and run `dc up --detach --wait`.
Redirect capacity scales with `api-web`. Extra workers are safe, because each scheduled job holds a Postgres advisory lock while it runs.

## Observe

### Health

| Endpoint            | Meaning                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /health`       | The process is up. Touches no dependency.                                                                  |
| `GET /health/ready` | `ok`, or `degraded` with one of Postgres and Redis down (still `200`), or `unavailable` (`503`) with both. |

`degraded` is deliberate: with Redis down redirects are answered from Postgres, and with Postgres down cached links keep redirecting.

### Metrics

Every API container serves Prometheus metrics at `GET /metrics` on port 3000.
The edge refuses that path, so Prometheus must join the internal network and scrape the replicas directly:

```yaml
scrape_configs:
  - job_name: shortener
    dns_sd_configs:
      - names: [api-web, api-worker]
        type: A
        port: 3000
```

The metrics are listed in the PRD, section 13. Beside them, each process reports the default Node.js metrics (`process_*`, `nodejs_*`).
`http_request_duration_seconds` is labelled with the route pattern, never the path, and every request that matched no route is `route="unmatched"`.

### Logs

Each container writes JSON to stdout, one record per line. Docker keeps 5 files of 50 MB per container.

```sh
dc logs --follow api-web
dc logs api-web api-worker | grep '"requestId":"<id>"'
```

- Every record written while a request is handled carries its `requestId`, which is also the `X-Request-Id` response header. One id finds everything a request logged.
- Each request ends with a `request completed` record: `method`, `route`, `path`, `status`, `durationMs`. Health checks and metric scrapes are not logged.
- Logs never hold a client address, a query string, a request body, or a full destination URL.

### Alerts

| Alert                              | Condition                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redirect availability budget burn  | `sum(rate(redirects_total{outcome="unavailable"}[1h])) / sum(rate(redirects_total[1h])) > 14.4 * 0.001`                                                                          |
| Management API budget burn         | `sum(rate(http_request_duration_seconds_count{route=~"/api/v1/.*",status=~"5.."}[1h])) / sum(rate(http_request_duration_seconds_count{route=~"/api/v1/.*"}[1h])) > 14.4 * 0.001` |
| Redirect latency over target       | `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{route="/:code"}[5m]))) > 0.1`                                                                   |
| Cache hit ratio under 80%          | `sum(rate(link_cache_lookups_total{result=~"hit\|negative_hit"}[15m])) / sum(rate(link_cache_lookups_total[15m])) < 0.8`                                                         |
| Click stream lagging for 5 minutes | `min_over_time(click_stream_lag[5m]) > 0`                                                                                                                                        |
| Lost cache invalidations           | `increase(link_cache_invalidation_failures_total[15m]) > 0`                                                                                                                      |
| A scheduled job failing            | `increase(job_runs_total{result="failure"}[1h]) > 0`                                                                                                                             |
| Non-empty default partition        | `SELECT count(*) FROM click_events_default` returns more than `0`: the partition job is behind                                                                                   |
| Redis memory over 80%              | `used_memory / maxmemory > 0.8`, from `dc exec redis redis-cli info memory`                                                                                                      |
| Certificate issuance failures      | Certificate errors in `dc logs edge`                                                                                                                                             |
| Failed backup                      | `last-success` in the backup directory is older than 26 hours                                                                                                                    |

`14.4 * 0.001` is a 99.9% objective burning a month's error budget in two days.

## Rate limits

Fixed 60 second windows, counted in Redis. A refusal is `429 RATE_LIMITED` with `Retry-After`, and is counted in `rate_limit_rejections_total{policy}`.

| Policy       | Applies to                                               | Keyed by                  | Variable                           |
| ------------ | -------------------------------------------------------- | ------------------------- | ---------------------------------- |
| `redirect`   | `GET /{code}`                                            | Client address            | `RATE_LIMIT_REDIRECT_PER_MINUTE`   |
| `api`        | Every `/api/v1` request                                  | Client address            | `RATE_LIMIT_API_PER_MINUTE`        |
| `credential` | `/api/v1` requests presenting a session or an API key    | SHA-256 of the credential | `RATE_LIMIT_CREDENTIAL_PER_MINUTE` |
| `auth`       | Sign-up, sign-in, verification, reset, invitation accept | Client address            | `RATE_LIMIT_AUTH_PER_MINUTE`       |

- An IPv6 client is keyed by its /64 prefix.
- The client address is only right when `TRUST_PROXY_HOPS` matches the number of proxies in front of the API. The production stack sets `1`, for the edge. Behind an extra load balancer raise it, or every visitor shares one limit.
- With Redis down, redirects are not limited and the management API answers `503`.
- To lift a limit early, delete its key: `dc exec redis redis-cli --scan --pattern 'ratelimit:*'` lists them.

## Platform admin

A platform admin is granted outside the product, in the database, to an existing verified account:

```sql
UPDATE users SET is_platform_admin = true WHERE email = 'operator@example.com';
```

Takedown actions are `POST` requests on the app host, signed in as that account (an API key is refused).
Each answers `200`, is safe to repeat, and is written to the audit log.

| Request                                         | Effect                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/admin/links/{linkId}/block`       | The link answers `410` on the next request. Its workspace cannot undo it.                                    |
| `POST /api/v1/admin/links/{linkId}/unblock`     | A blocked link becomes active. A link that is not blocked is left as it is.                                  |
| `POST /api/v1/admin/domains/{domainId}/block`   | Every link on the host answers `404`, and no workspace can activate that host. A platform domain is refused. |
| `POST /api/v1/admin/domains/{domainId}/unblock` | The domain returns to pending and must pass DNS verification again before it serves.                         |
| `POST /api/v1/admin/users/{userId}/disable`     | The account is signed out everywhere and cannot sign in. Its links keep working: block those separately.     |
| `POST /api/v1/admin/users/{userId}/enable`      | The account can sign in again.                                                                               |

If several workspaces claim one host, block the claim that is `ACTIVE`; blocking a pending claim while another serves is refused with `409`.

## Back up

| Data           | Protection                                                        | Objective                                     |
| -------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| Postgres       | Continuous WAL archiving, plus a daily logical dump kept 30 days  | Lose at most 5 minutes; restore within 1 hour |
| Redis          | Append-only file, synced every second                             | Disposable: cache and seconds of clicks       |
| Certificates   | The `caddy-data` volume                                           | Re-issued automatically if lost               |
| GeoIP database | Replace `deploy/geoip/country.mmdb` monthly, then restart the API | Re-downloadable                               |

### Daily logical dump

`deploy/scripts/backup.sh` writes `shortener-<UTC time>.dump` into `BACKUP_DIR`, verifies that the archive is readable, records the time in `last-success`, and deletes dumps older than `BACKUP_RETENTION_DAYS`.
`BACKUP_DIR` must be storage that is not the database host's disk.

```sh
dc --profile tools run --rm backup
```

Schedule it daily, for example in the host's crontab:

```cron
15 3 * * * cd /srv/shortener && docker compose --env-file deploy/production.env --file deploy/docker-compose.production.yml --profile tools run --rm backup
```

### Point-in-time recovery

- **Managed Postgres:** enable the provider's point-in-time recovery with at least 7 days of retention. Nothing else to run.
- **Postgres on this host (`--profile postgres`):** the server archives every WAL segment to `WAL_ARCHIVE_DIR`, at least every 5 minutes. A point in time can only be restored on top of a base backup, so take one weekly:

  ```sh
  dc --profile postgres exec --user postgres postgres sh -c \
    'pg_basebackup --username shortener --format tar --gzip --wal-method fetch \
       --pgdata "/wal-archive/base/$(date -u +%Y%m%dT%H%M%SZ)"'
  ```

  Check that archiving works: `failed_count` must stay `0`.

  ```sh
  dc --profile postgres exec postgres psql --username shortener --dbname shortener \
    --command 'SELECT archived_count, failed_count, last_archived_time FROM pg_stat_archiver'
  ```

## Restore

Rehearse both procedures before launch and every quarter.

### From a logical dump

The script restores only into an empty database and never into `DATABASE_URL`, so a restore cannot overwrite live data by accident.

1. Create an empty database, on the same server or a new one.
2. Restore into it:

   ```sh
   RESTORE_DATABASE_URL=postgres://user:password@host:5432/shortener_restored \
     dc --profile tools run --rm backup /scripts/restore.sh /backups/shortener-<time>.dump
   ```

   It ends with `Restore complete: <n> links in the restored database.`

3. Point `DATABASE_URL` at the restored database and run `dc up --detach --wait`.
4. Flush the redirect cache, which may describe links newer than the dump: `dc exec redis redis-cli flushdb`. Unprocessed clicks in the stream are lost with it.

### To a point in time, Postgres on this host

1. Stop everything that writes, and the database:

   ```sh
   dc --profile postgres stop api-web api-worker postgres
   ```

2. Replace the data directory with a base backup taken before the target time, and say where to stop:

   ```sh
   dc --profile postgres run --rm --no-deps --user postgres --entrypoint sh \
     --env BASE_BACKUP=/wal-archive/base/<time> \
     --env RECOVERY_TARGET_TIME='2026-01-31 12:00:00+00' \
     postgres -c '
       set -eu
       find "$PGDATA" -mindepth 1 -delete
       tar -xzf "$BASE_BACKUP/base.tar.gz" -C "$PGDATA"
       {
         echo "restore_command = '\''cp /wal-archive/%f %p'\''"
         echo "recovery_target_time = '\''$RECOVERY_TARGET_TIME'\''"
         echo "recovery_target_action = '\''promote'\''"
       } >>"$PGDATA/postgresql.auto.conf"
       touch "$PGDATA/recovery.signal"
     '
   ```

3. Start Postgres. It replays the archived WAL up to the target, then opens for writes:

   ```sh
   dc --profile postgres up --detach --wait postgres
   ```

4. Check the data, then start the rest and flush the redirect cache:

   ```sh
   dc --profile postgres up --detach --wait
   dc exec redis redis-cli flushdb
   ```

5. Take a new base backup: recovery started a new timeline.

### Redis

Nothing to restore. Start an empty Redis: the cache refills from Postgres, rate-limit windows restart, and clicks that were in the stream are lost.

## When something is down

| Failure            | What happens                                                                                       | What to do                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Redis              | Redirects come from Postgres, unlimited. Clicks are not counted. The management API answers `503`. | Restore Redis. Nothing to replay.                           |
| Postgres           | Cached links redirect for up to 1 hour. Uncached codes and every write answer `503`.               | Restore Postgres within the hour to stay invisible.         |
| Both               | `503` everywhere, and `/health/ready` is `503`.                                                    | Postgres first.                                             |
| Worker             | Redirects are unaffected. Clicks queue in the stream, up to about a million.                       | Restart `api-worker`. The queue is processed on recovery.   |
| One `api-web` copy | The others serve.                                                                                  | `dc up --detach --wait api-web`                             |
| Edge               | Everything is unreachable from outside.                                                            | `dc up --detach --wait edge`. Certificates are on a volume. |
