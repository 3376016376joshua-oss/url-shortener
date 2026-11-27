# url-shortener

A URL shortener MVP: create short links, redirect them in a few milliseconds through a Redis cache, expire and manage them, rate limit abuse, and count clicks without ever slowing a redirect down.

Built with TypeScript, NestJS, PostgreSQL, and Redis, and run with Docker Compose.

## Product requirements

**[Read the PRD: docs/PRD.md](docs/PRD.md)**

The PRD is the source of truth for what this project builds: goals and non-goals, the API contract, the data model, caching and expiry rules, rate limits, analytics, acceptance criteria, and how the work is split into modules.
