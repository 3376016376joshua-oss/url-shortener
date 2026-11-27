# url-shortener

A URL shortener MVP: create short links, redirect them in a few milliseconds through a Redis cache, expire and manage them, rate limit abuse, and count clicks without ever slowing a redirect down.

Built with TypeScript, NestJS, PostgreSQL, and Redis, and run with Docker Compose.

## Product requirements

**[Read the PRD: docs/PRD.md](docs/PRD.md)**

The PRD is the source of truth for what this project builds: goals and non-goals, the API contract, the data model, caching and expiry rules, rate limits, analytics, acceptance criteria, and how the work is split into modules.

## Run it

```sh
docker compose up
```

This starts Postgres and Redis, applies the database migrations, and then starts the application on http://localhost:3000.

```sh
curl http://localhost:3000/health/ready
# {"status":"ok","checks":{"postgres":"up","redis":"up"}}
```

If a default port is taken, move it: `APP_PORT=3001 POSTGRES_PORT=5433 REDIS_PORT=6380 docker compose up`.

## Develop

Requires Node.js 24.11 or newer (see `.nvmrc`) and pnpm.

```sh
pnpm install
docker compose up -d postgres redis   # dependencies only
cp .env.example .env
pnpm build && pnpm migration:run      # apply migrations
pnpm start:dev                        # run the app with reload
```

| Command                             | What it does                               |
| ----------------------------------- | ------------------------------------------ |
| `pnpm lint`                         | ESLint, type-aware                         |
| `pnpm format` / `pnpm format:check` | Prettier                                   |
| `pnpm typecheck`                    | TypeScript, strict                         |
| `pnpm build`                        | Compile to `dist/`                         |
| `pnpm test`                         | Unit tests (`src/**/*.spec.ts`)            |
| `pnpm test:e2e`                     | End-to-end tests (`test/**/*.e2e-spec.ts`) |

End-to-end tests run the whole application against the Postgres and Redis from Docker Compose.
They use their own database (`shortener_test`, rebuilt from the migrations on every run) and their own Redis logical database, so they never touch development data.
They honour the same `POSTGRES_PORT` and `REDIS_PORT` overrides as Compose.

### Several checkouts on one machine

Every checkout of this repository has the same directory name, so Docker Compose gives them the same project name and they would share containers.
Give each one its own project name and ports, and export them so the tests see the same ports:

```sh
export COMPOSE_PROJECT_NAME=url-shortener-links APP_PORT=3001 POSTGRES_PORT=5433 REDIS_PORT=6380
docker compose up -d postgres redis
pnpm test:e2e
```

## Layout

| Path             | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `src/config`     | Environment schema, validated at start-up                  |
| `src/database`   | Entities, migrations, and the migration runner             |
| `src/redis`      | The shared Redis client                                    |
| `src/health`     | Liveness and readiness endpoints                           |
| `src/common`     | Error contract, link rules, metrics and rate-limit modules |
| `src/links`      | Create and manage API (write path)                         |
| `src/redirect`   | The redirect (read path)                                   |
| `src/link-cache` | Redis cache-aside for link lookups                         |
| `src/analytics`  | Async click analytics                                      |
| `test`           | End-to-end tests and their support code                    |

Which workstream owns which directory, and the contracts between them, are in [section 17 of the PRD](docs/PRD.md#17-work-split).
