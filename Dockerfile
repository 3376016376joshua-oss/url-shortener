# syntax=docker/dockerfile:1
# One file, two images, built from the repository root:
#   --target api   the API, the redirect service, and the background workers
#   --target edge  Caddy serving the dashboard and proxying to the API
ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /repo
# Install the pnpm version pinned in package.json, so there is one source of truth.
COPY package.json ./
RUN npm install --global "$(node --print "require('./package.json').packageManager")"
COPY pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS api-build
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter "@url-shortener/api..." run build
# A self-contained copy of the API with production dependencies only.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --filter @url-shortener/api deploy --prod /out

FROM node:${NODE_VERSION}-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build --chown=node:node /out/package.json ./
COPY --from=api-build --chown=node:node /out/node_modules ./node_modules
COPY --from=api-build --chown=node:node /out/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM base AS web-build
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter "@url-shortener/web..." run build

FROM caddy:2-alpine AS edge
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /repo/apps/web/dist /srv
EXPOSE 80
