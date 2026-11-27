# url-shortener

A link management platform: short links on your own domain, QR codes, click analytics by country and device, and A/B destination testing, with a dashboard and an API.

Built with TypeScript, NestJS, PostgreSQL, Redis, React, and Caddy, and run with Docker Compose.

## Product requirements

**[Read the PRD: docs/PRD.md](docs/PRD.md)**

The PRD is the source of truth for what this project builds: goals and non-goals, every feature area, the API contract, the data model, production concerns, the decisions that are the captain's to make, acceptance criteria, and how the work is split into parallel workstreams.

> **Status.** This repository currently holds the PRD and the foundation: the schema, the contracts between workstreams, and the running skeleton. The features are built in the workstreams described in [section 17 of the PRD](docs/PRD.md#17-work-split).

## Run it

```sh
docker compose up
```

This starts Postgres, Redis, and a mail catcher, applies the database migrations, and then starts the API and the edge.

| What          | Where                              |
| ------------- | ---------------------------------- |
| Dashboard     | http://localhost:8080              |
| Short links   | `http://sho.localhost:8080/<code>` |
| API, directly | http://localhost:3000              |
| Caught email  | http://localhost:8025              |

```sh
curl http://localhost:3000/health/ready
# {"status":"ok","checks":{"postgres":"up","redis":"up"}}
```

If a default port is taken, move it: `WEB_PORT=8081 API_PORT=3001 POSTGRES_PORT=5433 REDIS_PORT=6380 MAILPIT_PORT=8026 docker compose up`.

## Develop

Requires Node.js 26 (see `.nvmrc`) and pnpm.

```sh
pnpm install
docker compose up -d postgres redis mailpit   # dependencies only
cp apps/api/.env.example apps/api/.env        # then set APP_SECRET
pnpm build && pnpm migration:run              # apply migrations
pnpm --filter @url-shortener/api start:dev    # the API on :3000, with reload
pnpm --filter @url-shortener/web dev          # the dashboard on :5173, proxying /api
```

Run these from the repository root; they cover every package.

| Command                             | What it does                                            |
| ----------------------------------- | ------------------------------------------------------- |
| `pnpm lint`                         | ESLint, type-aware                                      |
| `pnpm format` / `pnpm format:check` | Prettier                                                |
| `pnpm typecheck`                    | TypeScript, strict                                      |
| `pnpm build`                        | Build every package                                     |
| `pnpm test`                         | Unit tests (`**/src/**/*.spec.ts(x)`)                   |
| `pnpm test:e2e`                     | API end-to-end tests (`apps/api/test/**/*.e2e-spec.ts`) |

End-to-end tests run the whole API against the Postgres and Redis from Docker Compose.
They use their own database (`shortener_test`, rebuilt from the migrations on every run) and their own Redis logical database, so they never touch development data.
They honour the same `POSTGRES_PORT` and `REDIS_PORT` overrides as Compose.
A run holds a lock in Postgres from start to finish, so two runs against the same Postgres take turns instead of interfering.

### Several checkouts on one machine

Every checkout of this repository has the same directory name, so Docker Compose gives them the same project name and they share containers.
That is safe for the end-to-end tests, which then simply queue behind each other, but not for running the application itself.
To work independently, give each checkout its own project name and ports, and export them so the tests see the same ports:

```sh
export COMPOSE_PROJECT_NAME=url-shortener-links WEB_PORT=8081 API_PORT=3001 POSTGRES_PORT=5433 REDIS_PORT=6380 MAILPIT_PORT=8026
docker compose up -d postgres redis
pnpm test:e2e
```

## Layout

| Path                 | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `apps/api`           | The API, the redirect service, and the background workers (NestJS) |
| `apps/web`           | The dashboard (React, Vite)                                        |
| `packages/contracts` | Request and response schemas shared by the API and the dashboard   |
| `deploy`             | Edge configuration (Caddy)                                         |
| `docs/PRD.md`        | The product requirements                                           |

Inside `apps/api/src`, each directory is one module. Which workstream owns which directory, and the contracts between them, are in [section 17 of the PRD](docs/PRD.md#17-work-split).
