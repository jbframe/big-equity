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
`docker-compose.yml` uses `restart: unless-stopped` and binds to
**127.0.0.1:8080** on the box, where the host nginx reverse proxy serves it at
**https://allin.makejohnacoffee.com** (TLS via Let's Encrypt — see `infra/`
and [ADR-001](../../docs/adr/001-expose-simulationweb.md)).
