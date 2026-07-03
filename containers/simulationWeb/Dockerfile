# Build stage: compile the Vite app to static assets.
FROM node:26-alpine AS build

WORKDIR /app

# Dependencies first for layer caching. `npm ci` installs exactly the lockfile.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

# Runtime stage: nginx serves the static bundle. No node, no app deps shipped.
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
