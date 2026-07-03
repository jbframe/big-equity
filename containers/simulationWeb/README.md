# simulationWeb

A browser front-end for the poker equity simulator. **React + TypeScript + Vite**. Currently a bare scaffold — the app
is being built up incrementally.

## Prerequisites

- Node.js 18+ (developed on Node 24)

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
`docker-compose.yml` publishes port **8080** and uses `restart: unless-stopped`
— open inbound 8080 on the EC2 security group (see `infra/`) to reach it.
