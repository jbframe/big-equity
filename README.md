# big-equity

A poker equity simulator, packaged as a container and deployed to a self-hosted
EC2 Docker host via GitHub Actions.

Each deployable lives under `containers/<name>/`. The provisioning and
deployment machinery — Terraform, the EC2 host, the CI pipelines, secrets, and
the full setup guide — lives in **[`infra/README.md`](infra/README.md)**.

---

## Containers

| Container | Summary | Readme |
| --- | --- | --- |
| `simulationPY` | Poker equity simulator — given hero/villain hands and a board, it runs out the remaining cards and reports each player's equity. Stdlib-only Python. | [containers/simulationPY/README.md](containers/simulationPY/README.md) |
| `simulationTS` | TypeScript rewrite of the poker equity simulator. Monte Carlo simulator for 5-card Omaha Hi-Lo with hand evaluation and pot-split logic. | [containers/simulationTS/README.md](containers/simulationTS/README.md) |
| `simulationWeb` | Browser front-end for the equity simulator. React + Framer Motion; the Monte Carlo runs client-side in a Web Worker. Served static via nginx. | [containers/simulationWeb/README.md](containers/simulationWeb/README.md) |

### Public internet exposure

| Container | Exposed | URL |
| --- | --- | --- |
| `simulationPY` | No | Internal only |
| `simulationTS` | No | Internal only |
| `simulationWeb` | Yes | https://allin.makejohnacoffee.com |
---

## Repository layout

```
.
├── containers/              # one self-contained, deployable container per dir
<<<<<<< HEAD
│   ├── simulationPY/        # poker equity simulator (Python)
│   ├── simulationTS/        # poker equity simulator (TypeScript)
│   └── simulationWeb/       # browser UI for the simulator
=======
│   └── simulationPY/        # the poker equity sim
>>>>>>> 306efb7 (Rename sim containers to simulationPY/TS, add simulationWeb)
├── infra/                   # Terraform + deployment — see infra/README.md
└── .github/workflows/       # infra.yml (terraform), deploy.yml (build + ship)
```

---

## Adding another container

1. Create `containers/<newname>/` with a `Dockerfile` and a `docker-compose.yml`
   (copy `simulationPY`'s as a template; point the compose `image` default at
   `ghcr.io/YOURUSER/big-equity/<newname>` — lowercased, GHCR requires it).
2. If it needs secrets, drop an `.env` on the box once — see [step 6 in the infra guide](infra/README.md#6-optional-give-a-container-its-env). Otherwise there's nothing to seed; the deploy pipeline syncs the compose file for you.
3. Push to `main` — the deploy pipeline auto-discovers the new folder and ships it.

That's the whole loop. For how the pipelines, host, and secrets fit together,
read **[`infra/README.md`](infra/README.md)**.

---

## Deployment

See **[`infra/README.md`](infra/README.md)** for the architecture, one-time
setup, day-to-day workflow, and cost.
