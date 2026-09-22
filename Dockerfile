# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Dependencies. Kept as its own stage so a source-only change reuses the
# npm install layer instead of reinstalling on every build.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Build.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `public` is empty and git does not track empty directories, so a fresh clone
# has none — and the COPY in the runtime stage would fail on it.
RUN mkdir -p public

# The build never contacts the database or any AI provider: pages are dynamic
# and every client is constructed lazily. No build-time secrets are needed.
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime. Only the standalone server, its static assets, and the migrations.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runner
WORKDIR /app

# Passed by CI. Without them a running container cannot be traced back to the
# commit that produced it, which turns "which version is live?" into guesswork.
ARG GIT_REVISION=unknown
ARG BUILD_DATE=unknown
ARG SOURCE_URL=https://github.com/alaeschaik/notebooklm-clone

LABEL org.opencontainers.image.title="notebook" \
      org.opencontainers.image.description="Grounded research notebook with verifiable citations" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.revision="${GIT_REVISION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="MIT"

# Readable from inside the container and surfaced by /api/health, so the running
# version can be confirmed without inspecting the image.
ENV GIT_REVISION=${GIT_REVISION} \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_DIR=/data/blobs

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 # The runtime starts with `node server.js` and never installs anything, so the
 # bundled package managers are pure attack surface. They also account for
 # every HIGH finding the image scan reports — tar, ip-address and
 # brace-expansion ship inside npm, not in this project's dependencies.
 && rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/corepack /opt/yarn* \
 && groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# `standalone` carries its own minimal node_modules; static assets are not
# included in it and have to be copied alongside.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Read at boot by the migration step in src/instrumentation.ts.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

RUN mkdir -p /data/blobs && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
