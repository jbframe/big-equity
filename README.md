# big-equity

A poker equity simulator, packaged as a container and deployed to a self-hosted
EC2 Docker host via GitHub Actions.

Each deployable lives under `containers/<name>/`. The provisioning and
deployment machinery — Terraform, the EC2 host, the CI pipelines, secrets, and
the full setup guide — lives in **[`infra/README.md`](infra/README.md)**.

---

## Repository layout

```
.
├── containers/              # one self-contained, deployable container per dir
│   └── simulationV1/        # the poker equity sim
│       ├── main.py          # entrypoint
│       ├── simulation.py
│       ├── evaluation.py
│       ├── Dockerfile       # builds this container's image
│       ├── docker-compose.yml
│       ├── requirements.txt # Python deps (stdlib-only today)
│       └── .dockerignore
├── infra/                   # Terraform + deployment — see infra/README.md
└── .github/workflows/       # infra.yml (terraform), deploy.yml (build + ship)
```

---

## Running locally

`simulationV1` is stdlib-only, so you can run it directly:

```bash
cd containers/simulationV1
python main.py
```

Or via Docker, exactly as it runs in production:

```bash
docker build -t simulationv1 containers/simulationV1
docker run --rm simulationv1
```

---

## Adding another container

1. Create `containers/<newname>/` with a `Dockerfile` and a `docker-compose.yml`
   (copy `simulationV1`'s as a template; point the compose `image` at
   `ghcr.io/YOURUSER/big-equity/<newname>`).
2. Seed it on the box once — see [step 6 in the infra guide](infra/README.md#6-seed-the-box-with-compose--env).
3. Push to `main` — the deploy pipeline auto-discovers the new folder and ships it.

That's the whole loop. For how the pipelines, host, and secrets fit together,
read **[`infra/README.md`](infra/README.md)**.

---

## Deployment

See **[`infra/README.md`](infra/README.md)** for the architecture, one-time
setup, day-to-day workflow, cost, and troubleshooting.
