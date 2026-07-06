# Build stage: compile the Vite app to static assets.
FROM node:24-alpine AS build

WORKDIR /app

# Dependencies first for layer caching. `npm ci` installs exactly the lockfile.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
# Vite envs are baked at build time; this is the API origin the SPA calls.
ARG VITE_API_BASE_URL=https://api.makejohnacoffee.com
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Runtime stage: nginx serves the static bundle. No node, no app deps shipped.
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
