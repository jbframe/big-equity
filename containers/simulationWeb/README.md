# simulationWeb

A browser front-end for the poker equity simulator. **React + TypeScript + Vite**. Currently a bare scaffold — the app
is being built up incrementally.

## Prerequisites

- Node.js 24 (LTS — see `.nvmrc`)

## Run

```sh
cd containers/simulationWeb
npm install
npm run dev        # http://localhost:5173
npm run build      # static bundle -> dist/
npm run typecheck
```

## Deployment

Built as a static site served by nginx (see `Dockerfile`). The repo's deploy
pipeline auto-discovers any `containers/<name>/` with a Dockerfile, so pushing
to `main` ships it. Unlike the batch-job sims this is a long-running service:
`docker-compose.yml` uses `restart: unless-stopped` and publishes no host
ports. It's served at **https://allin.makejohnacoffee.com**, but the
reverseProxy edge ([ADR-009](../../docs/adr/009-reverse-proxy-container.md))
never talks to this container directly: it routes the `allin.…` vhost
wholesale to simulationAPI, the app gateway
([ADR-010](../../docs/adr/010-gateway-in-simulationapi.md)), which enforces
the FusionAuth login wall and proxies valid sessions through to
`simulationweb:80` over `simulation-net` (TLS via Let's Encrypt — see
[ADR-001](../../docs/adr/001-expose-simulationweb.md)).
