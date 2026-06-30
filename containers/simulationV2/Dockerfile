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

# Runtime stage: the compiled output has zero npm runtime deps, so we ship just
# node + dist — no node_modules. package.json tags along for its
# "type": "module", which tells Node to treat the emitted .js as ESM.
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime

WORKDIR /app

COPY package.json ./
COPY --from=build /app/dist ./dist

# simulationV2 is a batch job: main.js runs the example matchups and exits.
CMD ["node", "dist/main.js"]
