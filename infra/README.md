# Infrastructure & deployment

Everything needed to provision the host and ship containers to it. Terraform
builds an EC2 Docker host; GitHub Actions builds each container's image and
deploys it — all via OIDC, with **no long-lived AWS keys**.

> Run all commands below **from the repository root** unless noted (the seed
> step touches `../containers/`). Markdown links in this file are relative to
> the `infra/` directory.

---

## Table of contents

- [Architecture](#architecture)
- [Layout](#layout)
- [Prerequisites](#prerequisites)
- [One-time setup](#one-time-setup)
  - [1. Create the deploy SSH key](#1-create-the-deploy-ssh-key)
  - [2. Bootstrap AWS (local, once)](#2-bootstrap-aws-local-once)
  - [3. Wire up the backend](#3-wire-up-the-backend)
  - [4. Configure GitHub variables & secrets](#4-configure-github-variables--secrets)
  - [5. Provision the box](#5-provision-the-box)
  - [6. Seed the box with compose + env](#6-seed-the-box-with-compose--env)
- [Day-to-day workflow](#day-to-day-workflow)
- [How it works](#how-it-works)
- [Cost & teardown](#cost--teardown)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
                 ┌──────────────────── GitHub ────────────────────┐
                 │                                                 │
  push infra/**  │   .github/workflows/infra.yml                   │
  ───────────────┼──►  terraform plan / apply  ──(OIDC)──┐         │
                 │                                        │        │
  push           │   .github/workflows/deploy.yml         │        │
  containers/**  │   docker build ─► ghcr.io  ──┐         │        │
  ───────────────┼──────────────────── SSH ──── │ ────────┼──┐     │
                 └─────────────────────────────┼──────────┼──┼─────┘
                                               │          │  │
                                               ▼          ▼  ▼
                                        ┌───────────────────────────┐
                                        │   AWS                      │
                                        │   ┌─────────────────────┐  │
                                        │   │ EC2 (Amazon Linux)  │  │
                                        │   │  Docker + Compose   │  │
                                        │   │  pulls ghcr images  │  │
                                        │   └─────────────────────┘  │
                                        │   S3 (terraform state)     │
                                        │   IAM role (OIDC trust)    │
                                        └───────────────────────────┘
```

Two **independent** pipelines:

| Pipeline | Trigger | Does |
|---|---|---|
| `terraform` | changes under `infra/**` | provisions / updates the EC2 host |
| `deploy` | changes under `containers/**` | for **each** `containers/<name>/`, builds image → GHCR → SSH pull on the box |

Keeping them separate means an app deploy can never accidentally destroy or
recreate the instance.

The `deploy` pipeline auto-discovers every `containers/<name>/` that has a
`Dockerfile` and fans out over them with a build matrix. Each container becomes
its own image (`ghcr.io/<owner>/<repo>/<name>`) and runs from its own directory
on the box (`~/containers/<name>/`). **Adding a new container is just a new
folder** — no workflow edits.

---

## Layout

```
infra/
├── bootstrap/           # run ONCE locally: state bucket + OIDC provider + role
│   └── main.tf
├── versions.tf          # provider + version pins (Terraform >= 1.10)
├── variables.tf
├── backend.tf           # S3 remote state config
├── main.tf              # VPC lookup, security group, key pair, EC2, Elastic IP
├── user_data.sh         # installs Docker + Compose on first boot
└── outputs.tf

.github/workflows/
├── infra.yml            # terraform plan / apply
└── deploy.yml           # discover containers → build + push + deploy
```

---

## Prerequisites

- An **AWS account** and the **AWS CLI** configured locally (`aws configure`)
  with credentials that can create S3/IAM/EC2 resources (admin is simplest for
  the one-time bootstrap).
- **Terraform >= 1.10** (required for S3-native state locking).
- The **GitHub CLI** (`gh`) authenticated to your account.
- This repo pushed to GitHub.

Replace these placeholders wherever they appear:

| Placeholder | Meaning |
|---|---|
| `YOURUSER/big-equity` | your GitHub `owner/repo` |
| `big-equity-tfstate-CHANGEME` | a **globally unique** S3 bucket name |

---

## One-time setup

### 1. Create the deploy SSH key

This keypair lets the deploy pipeline SSH into the box. The **public** key goes
to EC2 via Terraform; the **private** key becomes a GitHub secret.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/ec2_deploy_key -N ""
```

### 2. Bootstrap AWS (local, once)

Creates the things the CI pipeline needs but can't create for itself: the
remote-state S3 bucket, the GitHub OIDC provider, and the IAM role Actions
assumes.

```bash
cd infra/bootstrap
terraform init
terraform apply \
  -var "github_repo=YOURUSER/big-equity" \
  -var "state_bucket_name=big-equity-tfstate-CHANGEME"
```

Note the two outputs — `state_bucket` and `role_arn`.

> The bootstrap config uses **local state** by design. Keep its `terraform.tfstate`
> (it's gitignored). You rarely touch it again.

### 3. Wire up the backend

Edit [`backend.tf`](backend.tf) and set `bucket` to the `state_bucket` value from
the previous step. (Backend blocks can't use variables, so this one literal is
edited by hand.)

### 4. Configure GitHub variables & secrets

**Variables** (non-sensitive, used by the terraform pipeline):

```bash
gh variable set AWS_ROLE_ARN --body "<role_arn from bootstrap>"
gh variable set MY_IP_CIDR   --body "$(curl -s ifconfig.me)/32"
```

**Secrets** (used by the deploy pipeline):

```bash
gh secret set EC2_SSH_KEY < ~/.ssh/ec2_deploy_key   # the PRIVATE key
gh secret set GHCR_PAT    --body "<a read:packages PAT>"
# EC2_HOST is set after the box exists — see next step.
```

> `GHCR_PAT` is a [Personal Access Token](https://github.com/settings/tokens)
> with **`read:packages`** scope, so the EC2 box can pull private images from
> GHCR. The build step itself uses the automatic `GITHUB_TOKEN` and needs no PAT.

### 5. Provision the box

You can let CI do it (push a change under `infra/`), or run it once locally to
get going immediately:

```bash
cd infra
terraform init
terraform apply -var "my_ip_cidr=$(curl -s ifconfig.me)/32"
```

Then record the instance IP as the deploy target:

```bash
gh secret set EC2_HOST --body "$(terraform -chdir=infra output -raw public_ip)"
```

### 6. Seed the box with compose + env

The deploy pipeline expects each container's `docker-compose.yml` to already
exist on the box under `~/containers/<name>/`. Seed every container once (and an
`.env` per container if it needs one):

```bash
IP=$(terraform -chdir=infra output -raw public_ip)
for d in containers/*/; do
  name=$(basename "$d")
  ssh -i ~/.ssh/ec2_deploy_key ec2-user@$IP "mkdir -p ~/containers/$name"
  scp -i ~/.ssh/ec2_deploy_key "$d/docker-compose.yml" ec2-user@$IP:~/containers/$name/
  ssh -i ~/.ssh/ec2_deploy_key ec2-user@$IP "touch ~/containers/$name/.env"
done
```

Setup done. ✅

---

## Day-to-day workflow

- **Change a container** → push to `main` → `deploy` builds a new image, pushes
  it to GHCR, SSHes in, and runs `docker compose up -d`.
- **Change infrastructure** → open a PR touching `infra/**` → review the
  `terraform plan` → merge → `terraform apply` runs (gated by the `production`
  environment approval).

Roll back a container by re-running the deploy pipeline against an older commit,
or on the box: `cd ~/containers/<name> && IMAGE=ghcr.io/YOURUSER/big-equity/<name>:<old-sha> docker compose up -d`.

---

## How it works

**OIDC instead of stored AWS keys.** The terraform pipeline requests an OIDC
token from GitHub (`permissions: id-token: write`). AWS trusts that token via
the IAM role created in bootstrap, whose trust policy is scoped to
`repo:YOURUSER/big-equity:*`. The role hands back short-lived credentials — no
AWS access keys ever live in GitHub.

**Remote state in S3.** Because CI runners are ephemeral, state lives in the S3
bucket (versioned + encrypted) with `use_lockfile = true` for concurrency
safety — no DynamoDB table needed on Terraform ≥ 1.10.

**Image registry: GHCR.** Free private images, authenticated with the built-in
`GITHUB_TOKEN` on push. Each container publishes to its own nested package,
`ghcr.io/<owner>/<repo>/<name>` (names are lowercased — GHCR requires it). The
box pulls using the `read:packages` PAT.

**The box.** Amazon Linux 2023 (latest AMI resolved at apply time via SSM),
Docker + Compose installed on first boot by [`user_data.sh`](user_data.sh),
fronted by an Elastic IP so `EC2_HOST` stays stable across reboots. SSH is
locked to `MY_IP_CIDR`; port 80 is closed unless you set `open_http = true`.

---

## Cost & teardown

- `t3.micro` + 20 GB gp3 + 1 Elastic IP is roughly free-tier eligible for the
  first year; after that, on the order of a few dollars a month. **An Elastic IP
  attached to a running instance is free; a *detached* one is billed** — so if
  you stop the instance for a while, release the EIP.
- The Terraform **state bucket costs pennies** (single-digit MB of state +
  versions; effectively $0 in the free-tier year).
- Tear everything down with:
  ```bash
  cd infra && terraform destroy
  # and, if you're fully done:
  cd bootstrap && terraform destroy
  ```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Error: configuring S3 Backend: ... NoSuchBucket` | `backend.tf` bucket name doesn't match the bootstrap output. |
| terraform pipeline: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | `AWS_ROLE_ARN` variable wrong, or the role's trust policy `sub` doesn't match `repo:owner/repo:*`. |
| deploy pipeline: `Permission denied (publickey)` | `EC2_SSH_KEY` isn't the **private** half of the key Terraform uploaded, or `EC2_HOST` is stale. |
| box can't pull image: `denied` / `unauthorized` | `GHCR_PAT` missing `read:packages`, or the package is private and the PAT belongs to a different account. |
| SSH from your laptop times out | your IP changed; update `MY_IP_CIDR` and re-apply, or use AWS SSM Session Manager. |
| deploy: `cd: ~/containers/<name>: No such file` | that container wasn't seeded on the box — run [step 6](#6-seed-the-box-with-compose--env) for it. |
| matrix builds nothing / `containers` is empty | the `containers/<name>/` dir is missing a `Dockerfile`, so discovery skips it. |
| state is locked / stale `.tflock` | a run was killed mid-apply; clear with `terraform force-unlock <LOCK_ID>` (ID is in the error). |
