# big-equity

A poker equity simulator, packaged as a container and deployed to a self-hosted
EC2 Docker host via GitHub Actions.

Each deployable lives under `containers/<name>/`. The provisioning and
deployment machinery — Terraform, the EC2 host, the CI pipelines, secrets, and
the full setup guide — lives in **[`infra/README.md`](infra/README.md)**.
Technology choices follow the defaults in
**[`docs/steering/tech-stack.md`](docs/steering/tech-stack.md)**.

---

## Containers

| Container | Summary | Readme |
| --- | --- | --- |
| `simulationWeb` | Browser front-end for the equity simulator. React 19 + TypeScript + Vite, served static via nginx; currently a bare scaffold being built up incrementally. | [containers/simulationWeb/README.md](containers/simulationWeb/README.md) |
| `simulationAPI` | Dual-role Fastify service (TypeScript, zod-validated routes): CRUD backend for simulationDB on `api.…` **and** app gateway (OIDC login + SPA proxy; login optional) on `allin.…`. | [containers/simulationAPI/README.md](containers/simulationAPI/README.md) |
| `simulationDB` | PostgreSQL database (upstream `postgres:18-alpine`, no Dockerfile). Docker-network-only — no host ports; its clients are simulationAPI (app data) and fusionAuth (its own `fusionauth` database). | [containers/simulationDB/README.md](containers/simulationDB/README.md) |
| `fusionAuth` | Self-hosted identity provider (upstream `fusionauth/fusionauth-app`, no Dockerfile). Reuses simulationDB (its own `fusionauth` database, no bundled Postgres); OpenSearch off (`SEARCH_TYPE=database`). | [containers/fusionAuth/README.md](containers/fusionAuth/README.md) |
| `reverseProxy` | The public edge: nginx + certbot in one image. Terminates TLS for all three hostnames on 80/443, routes to the other containers over `simulation-net`, and owns the Let's Encrypt issue/renew loop. | [containers/reverseProxy/README.md](containers/reverseProxy/README.md) |

> **Note:** two earlier batch simulators, `simulationPY` (stdlib-only Python)
> and `simulationTS` (its TypeScript rewrite), have been removed — the
> browser-side engine in `simulationWeb` superseded them. They last existed at
> commit [`54d6020`](https://github.com/jbframe/big-equity/tree/54d6020860f971e6c0815ff8b3c4e31fefb496ce/containers).

### `simulation-net`

`simulation-net` is the shared Docker bridge network all containers on the
host join. It's created once at instance boot (and idempotently by the deploy
pipeline), and each container's compose file declares it `external`.
Containers reach each other over it by Docker DNS name; nothing on it is
reachable from the internet except through `reverseProxy`, the only container
that publishes host ports.

### Public internet exposure

| Container | Exposed | URL |
| --- | --- | --- |
| `simulationWeb` | Via proxy | https://allin.makejohnacoffee.com — public; FusionAuth login is optional (needed only to save results); no host ports, Docker network only |
| `simulationAPI` | Via proxy | https://api.makejohnacoffee.com; also serves the whole `allin.…` vhost as the SPA's app gateway; no host ports |
| `simulationDB` | No | Docker network only; dev-only public-access toggle via `./cmd db-access` |
| `fusionAuth` | Via proxy | https://id.makejohnacoffee.com; no host ports |
| `reverseProxy` | **Yes — the only one** | Publishes 80/443 and fronts the three rows above |

### Container diagram (C4)

How the containers fit together on the Docker host (`simulation-net`). The
edge routes by hostname only; everything app-aware happens inside
simulationAPI, the app gateway:

```mermaid
%%{init: {'themeVariables': {'edgeLabelBackground': '#1f2937'}}}%%
graph TB
    User["👤 <b>User</b><br/>[Person]<br/>Poker player in a browser<br/>allin.makejohnacoffee.com"]
    APIClient["👤 <b>API client</b><br/>[Person]<br/>Direct REST consumer<br/>api.makejohnacoffee.com"]
    Operator["👤 <b>Operator</b><br/>[Person]<br/>FusionAuth admin UI<br/>id.makejohnacoffee.com"]
    LE["<b>Let's Encrypt</b><br/>[Software System]<br/>ACME certificate authority"]

    subgraph EC2["EC2 Docker host · t3.micro · Amazon Linux 2023 (latest via SSM) · simulation-net"]
        Proxy["<b>reverseProxy</b><br/>[Container: nginx + certbot]<br/>Public edge — the only container with host<br/>ports (80/443); TLS for all three hostnames,<br/>hostname routing, cert issue/renew"]
        API["<b>simulationAPI</b><br/>[Container: Node.js, Fastify]<br/>Data API (api.…) and app gateway /<br/>SPA proxy (allin.…), login optional"]
        Web["<b>simulationWeb</b><br/>[Container: React SPA on nginx]<br/>Static front-end; reachable only<br/>through simulationAPI's gateway"]
        Auth["<b>fusionAuth</b><br/>[Container: FusionAuth, JVM]<br/>Identity provider (id.…): hosted<br/>login, OIDC, admin UI"]
        DB[("<b>simulationDB</b><br/>[Container: PostgreSQL 18]<br/>App data plus FusionAuth's own<br/>database; Docker network only")]
    end

    User -- "HTTPS · allin.…<br/>(and id.… for hosted login)" --> Proxy
    APIClient -- "HTTPS · api.…" --> Proxy
    Operator -- "HTTPS · id.…" --> Proxy
    Proxy -- "ACME HTTP-01<br/>cert issue + renew" --> LE
    Proxy -- "Proxies allin.… and api.…<br/>HTTP :3003" --> API
    Proxy -- "Proxies id.…<br/>HTTP :9011" --> Auth
    API -- "Proxies the SPA,<br/>session or not · HTTP :80" --> Web
    API -. "OIDC back-channel: code→token, JWKS<br/>HTTPS · id.… (back through the edge)" .-> Auth
    API -- "Reads/writes app data<br/>postgres :5432" --> DB
    Auth -- "Own fusionauth database<br/>postgres :5432" --> DB

    classDef person fill:#08427b,stroke:#3b82f6,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef external fill:#686868,stroke:#8a8a8a,color:#ffffff
    class User,APIClient,Operator person
    class Proxy,API,Web,Auth,DB container
    class LE external
    style EC2 fill:transparent,stroke:#94a3b8,stroke-dasharray:6 4,color:#94a3b8

    linkStyle default stroke:#94a3b8,color:#ffffff
    linkStyle 0,1 stroke:#e4a33c
    linkStyle 2 stroke:#a06ee0
    linkStyle 3,4,5 stroke:#4fb477
    linkStyle 6 stroke:#38bdf8
    linkStyle 7,8 stroke:#e46e6e
```

Below-container detail lives with the containers and decisions:

- Request routing per URL and the login round-trip:
  [containers/simulationAPI/README.md](containers/simulationAPI/README.md)
- Edge/TLS mechanics: [containers/reverseProxy/README.md](containers/reverseProxy/README.md)
- EC2 host, security groups, pipelines: [infra/README.md](infra/README.md)

---

## Running the app locally

Only the stateful/upstream pieces run in Docker locally; the code you edit
runs natively with its watch-mode dev servers. The prod compose files under
`containers/` are deploy artifacts for the box (external `simulation-net`,
GHCR images, pipeline-written `.env`) and aren't used for local dev —
[`scripts/local-stack.sh`](scripts/local-stack.sh) stands in for them:

```sh
./cmd local-stack hosts   # one-time: local.* names -> 127.0.0.1 in /etc/hosts (sudo)
./cmd local-stack         # Postgres + FusionAuth + local edge, waits until healthy
./cmd local               # both dev servers: API on :3003 (local.* env), SPA on :5173
```

`./cmd local` installs deps and runs both watch-mode servers with `[api]`/`[web]`
prefixed output; Ctrl-C stops both. To run one on its own:
`npm run dev:local` in `containers/simulationAPI`, `npm run dev` in
`containers/simulationWeb`.

Then open **http://local.allin.makejohnacoffee.com** — the simulator works
without signing in. To exercise the login flow (saving results, settings
sync), sign in as `player@example.com` (password: `LOCAL_PLAYER_PASSWORD` in
`containers/simulationAPI/.env.local`) — the full prod flow (Log in →
hosted FusionAuth login → session cookie → SPA) runs locally.

| Local URL | Prod equivalent | What answers |
| --- | --- | --- |
| http://local.allin.makejohnacoffee.com | https://allin.makejohnacoffee.com | simulationAPI's app gateway, proxying the Vite dev server (login optional) |
| http://local.api.makejohnacoffee.com | https://api.makejohnacoffee.com | simulationAPI's results CRUD (session-gated, CORS for the local app origin) |
| http://local.id.makejohnacoffee.com | https://id.makejohnacoffee.com | FusionAuth (admin UI: `admin@example.com`, password: `LOCAL_ADMIN_PASSWORD` in `.env.local`) |
| `localhost:5432` | Docker-network-only on the box | Postgres (`postgresql://simulation:simulation@localhost:5432/simulation`) |

How the pieces map to prod:

- A tiny nginx (`edge` in the local stack, config in
  [`scripts/local-stack/nginx.conf`](scripts/local-stack/nginx.conf)) stands in
  for reverseProxy: hostname routing on `:80`, no TLS — certbot's job has no
  local equivalent, hence plain `http` and the `local.` prefix.
- FusionAuth is provisioned on first boot by
  [`scripts/local-stack/kickstart.json`](scripts/local-stack/kickstart.json):
  tenant issuer, an RS256 signing key, the `poker_equity` app (prod client
  id, generated local secret), and the two users above. No clicking through
  the setup wizard.
- `npm run dev:local` starts the API with
  `containers/simulationAPI/.env.local`, which points the OIDC config at the
  local FusionAuth and the SPA proxy at the Vite dev server. The file is
  generated by `./cmd local-stack` (gitignored; random `AUTH_CLIENT_SECRET`
  and user passwords per checkout); FusionAuth is kickstarted with the same
  values. To rotate them: delete `.env.local`, then `./cmd local-stack reset`
  and `up` again.
  Plain `npm run dev` still works for API-only work against `localhost:5432`;
  the gateway routes 404 without the alias env, and `npm test` (fastify
  inject) covers the session-gated routes without any of this.

Caveats:

- **Vite HMR doesn't cross the gateway** (the SPA proxy doesn't forward
  websockets). Iterating on the front end alone? Use http://localhost:5173
  directly; through `local.allin.…` you reload manually.
- **Fresh start**: `./cmd local-stack reset` drops the data volume; the next
  `up` re-runs the Postgres role separation and the FusionAuth kickstart.

---

## Repository layout

```
.
├── cmd                      # launcher for the scripts in scripts/ — ./cmd lists them
├── containers/              # one self-contained, deployable container per dir
├── docs/                    # ADRs (docs/adr/), stories (docs/stories/), steering docs (docs/steering/)
├── infra/                   # Terraform + deployment — see infra/README.md
├── scripts/                 # operator tooling, run from your machine
└── .github/workflows/       # infra.yml (terraform), deploy.yml (build + ship), db-access.yml (DB dev-access toggle)
```

---

## Scripts

Operator tooling under `scripts/` — run from your machine, nothing to install
on the box. Call everything through [`cmd`](cmd), the launcher at the repo
root (no shell config needed — but note the leading `./`; zsh/bash won't find
a bare `cmd`):

```sh
./cmd                    # list available commands
./cmd monitor            # live watch-style view (".sh" suffix optional); ctrl-c to exit
./cmd monitor --snap     # one-shot health snapshot
./cmd db-access enable   # open 5432 to your current public IP
./cmd db-access disable  # close 5432 when you're done
```

Arguments after the command name pass through to the script, so
`./cmd monitor --snap` runs `scripts/monitor.sh --snap`. Any executable
`<name>.sh` added to `scripts/` becomes a `./cmd <name>` command
automatically.

| Script | What it does |
| --- | --- |
| [`scripts/monitor.sh`](scripts/monitor.sh) | Health/CPU/mem/disk/network view of the EC2 host and its containers over SSH. Default is a live watch-style table (one row per container plus a `NODE` row) with net/disk as per-second rates; `--snap` prints a one-shot snapshot instead. Resolves the host from `$EC2_HOST` or `terraform output`. |
| [`scripts/db-access.sh`](scripts/db-access.sh) | Toggle dev-only public access to simulationDB. `enable` detects your current public IP and dispatches the [db-access workflow](.github/workflows/db-access.yml) to open 5432 to it; `disable` closes it. Follows the run to completion via `gh run watch`. Requires the `gh` CLI. |
| [`scripts/local-stack.sh`](scripts/local-stack.sh) | Local stack: Postgres + FusionAuth + a `local.*` hostname edge in Docker (`up`/`down`/`reset`/`status`/`hosts`), mirroring the box topology with kickstarted dev credentials. Run the API (`npm run dev:local`) and web (`npm run dev`) natively against it — see [Running the app locally](#running-the-app-locally). |
| [`scripts/local.sh`](scripts/local.sh) | Both native dev servers in one terminal: the API (`npm run dev:local`, :3003) and the SPA (`npm run dev`, :5173), output prefixed `[api]`/`[web]`; Ctrl-C stops both. Expects the stack from `./cmd local-stack` to be up. |

---

## Adding another container

1. Create `containers/<newname>/` with a `Dockerfile` and a `docker-compose.yml`
   (copy `simulationWeb`'s as a template; point the compose `image` default at
   `ghcr.io/YOURUSER/big-equity/<newname>` — lowercased, GHCR requires it).
   Running an upstream image instead? Skip the Dockerfile — a compose-only
   directory deploys without the build step (like `simulationDB`).
2. If it needs secrets, drop an `.env` on the box once — see [step 6 in the infra guide](infra/README.md#6-optional-give-a-container-its-env). Otherwise there's nothing to seed; the deploy pipeline syncs the compose file for you.
3. Push to `main` — the deploy pipeline auto-discovers the new folder and ships it.

That's the whole loop. For how the pipelines, host, and secrets fit together,
read **[`infra/README.md`](infra/README.md)**.

---

## Deployment

See **[`infra/README.md`](infra/README.md)** for the architecture, one-time
setup, day-to-day workflow, and cost.
