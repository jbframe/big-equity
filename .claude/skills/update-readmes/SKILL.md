---
name: update-readmes
description: Audit every README in the repo against the actual code and infrastructure, then fix what has drifted. Use when asked to update, refresh, sync, or audit the READMEs (or docs) in this repo.
---

# Update the READMEs

Bring every tracked README back in line with reality. The rule: **verify each
claim against the code, never against another README** — drift propagates
through cross-references.

## 1. Inventory

```sh
find . -name "README*" -not -path "*/node_modules/*" -not -path "*/.git/*"
```

Only update **git-tracked** files (`git ls-files` to confirm). Untracked
README-bearing directories (e.g. stray copies under `.vscode/`) are not part of
the repo — leave them alone and flag them to the user.

Expected set: root `README.md`, `infra/README.md`, and one per
`containers/<name>/`.

## 2. Gather ground truth

For each container:
- `package.json` — scripts, dependencies (framework claims live or die here)
- `.nvmrc` — the Node prerequisite to state ("Node.js 24 (LTS — see `.nvmrc`)")
- `Dockerfile` — runtime base image (`grep ^FROM`), build strategy
- `docker-compose.yml` — ports, `restart:` policy (batch job vs long-running
  service)
- `src/` listing — layout tables must match the actual files, including tests
- For simulationPY: `requirements.txt` (stdlib-only claim), `be.yml`

For infra and the root diagram:
- `infra/variables.tf` — instance type, `app_domain`, `api_domain`, defaults
- `infra/user_data.sh.tftpl` — nginx vhosts, proxy ports, rate limits, certbot
- `.github/workflows/` — pipeline names, triggers, what they actually do
- `docs/adr/` — link every ADR that a README cites; add new ADRs where relevant

Check what's live (exposure tables must say what is true *now*, not what will
be true after a rebuild):

```sh
curl -sS -m 10 https://api.makejohnacoffee.com/health   # expect {"status":"ok"}
curl -sS -o /dev/null -m 10 -w "%{http_code}" https://allin.makejohnacoffee.com  # expect 200
```

## 3. Known drift spots

These are the places that have gone stale before — check them every time:

- **Root README container table** — descriptions must match current code, not
  aspirations (e.g. simulationWeb was described with features it didn't have).
- **Root README exposure table** — no "will be live after X" language once the
  thing is live; verify with curl.
- **Root README mermaid diagram** — one client node per public hostname,
  runtime image on each container node, EC2 node says
  `t3.micro · Amazon Linux 2023 (latest via SSM)`. Never hardcode a specific
  AMI name — it's resolved at apply time and drifts.
- **Root README repository layout** — top-level dirs (`containers/`, `docs/`,
  `infra/`, `.github/workflows/`) all present.
- **Node prerequisites** — must match `.nvmrc`, not "developed on Node N"
  folklore.
- **`cd` paths in setup snippets** — always `cd containers/<name>` (runnable
  from repo root).
- **Layout tables** — include test files; match `src/` exactly.

## 4. House style

Container READMEs follow the shape of `containers/simulationAPI/README.md`:
title, one-paragraph description (what it is, link its ADR if it has one),
Prerequisites, Setup/Run with fenced `sh` blocks, Layout table, Deployment
paragraph (how it ships via `deploy.yml`, port binding, public vs private).
Batch jobs (PY, TS) say so explicitly; exposed services name their URL and the
nginx/ADR-001 pattern.

## 5. Finish

- Re-verify `infra/README.md` claims against the `.tf` files even if you change
  nothing — report "verified current" rather than skipping it.
- Summarize per file: what was stale, what you verified it against.
- Do not commit unless asked.
