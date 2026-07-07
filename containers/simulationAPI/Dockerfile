# Alpine base: minimal package set means a far smaller CVE surface than the
# debian-based node images. Pinned by digest for reproducible, tamper-evident
# builds; Dependabot bumps both the digest and the tag comment on new
# 24-alpine builds.
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build

WORKDIR /app

# Dependencies first for better layer caching. `npm ci` installs exactly what
# the lockfile pins (including the devDeps that compile the TypeScript).
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage: Fastify and friends are runtime deps, so this stage needs
# production node_modules — `npm ci --omit=dev` requires the lockfile
# alongside package.json.
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
# Plain-SQL migrations, applied programmatically at startup (ADR-003) — the
# migrator resolves drizzle/ relative to dist at runtime.
COPY drizzle ./drizzle

EXPOSE 3003

# Long-running HTTP service (unlike the batch simulators).
CMD ["node", "dist/main.js"]
