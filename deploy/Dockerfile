# Linux amd64 server, independent of the Windows installer.
FROM node:24.19.0-bookworm-slim@sha256:e5a8dee7bc1e6a215d224a7ef8206f7e77271bc3cabd5febf2beafac0674f174 AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca --mount=type=cache,target=/root/.npm \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --no-fund --no-audit --fetch-timeout=30000 --fetch-retries=1
COPY vite.server.config.ts ./
COPY scripts/ scripts/
COPY apps/api/ apps/api/
COPY packages/ packages/
RUN npm run api:build

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24.19.0-bookworm-slim@sha256:e5a8dee7bc1e6a215d224a7ef8206f7e77271bc3cabd5febf2beafac0674f174
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules/ node_modules/
COPY --chown=node:node package.json ./
COPY --from=build --chown=node:node /app/server-dist/ server-dist/
COPY --chown=node:node packages/db/migrations/ server-dist/migrations/
COPY --chown=node:node deploy/*.mjs deploy/*.sql deploy/
USER node
EXPOSE 8787
ENTRYPOINT ["node", "deploy/entrypoint.mjs"]
CMD ["api"]
