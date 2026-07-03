# ADR-005: Dev-only public access toggle for simulationDB (DRAFT)

Date: 2026-07-03

Status: **Draft** — design settled during ADR-003 and recorded here as its own decision; implement after ADR-003's core (container, ORM, backups) lands.

## Requirements
- Temporary, manually triggered public access to simulationDB for development — never part of prod operation (ADR-003 keeps the DB docker-network-only normally)
- Toggleable from GitHub by a human, fully reversible, and failing closed
- Access scoped to the caller: a required CIDR input, never `0.0.0.0/0`
- Developers connect via the existing `db.makejohnacoffee.com` DNS record on 5432 (plain DNS to the EC2 IP — Postgres isn't HTTP, so nginx is not in the path)
- No long-lived AWS credentials in GitHub secrets
- A forgot-to-close failsafe

## Options
1. **Manual GitHub workflow toggling SG rule + compose port override** — `workflow_dispatch` with enable/disable; opens 5432 to the caller's CIDR and adds a host port via `docker-compose.override.yml`
2. **SSH tunnel runbook, no infrastructure change** — `ssh -L 5432:localhost:5432` with the existing deploy key; zero new attack surface but requires key distribution and per-developer setup each session
3. **Standing SG rule for a fixed dev IP** — always-open 5432 restricted to one static IP; simplest but permanent exposure and breaks whenever the IP changes

## Decision
Option 1 — a manual GitHub workflow (`.github/workflows/db-access.yml`, `workflow_dispatch`) with an `enable`/`disable` input and a **required** CIDR input:

- *enable:* `aws ec2 authorize-security-group-ingress` for 5432 from the given CIDR, then over SSH drop a `docker-compose.override.yml` (`ports: "5432:5432"`) next to simulationDB's compose file and `up -d`. Developers connect at `db.makejohnacoffee.com:5432`
- *disable:* remove the override, `up -d` (container recreated with no host port), revoke the SG rule
- AWS credentials via GitHub OIDC assuming an IAM role scoped to just the two security-group actions
- A scheduled nightly `disable` run as the forgot-to-close failsafe

## Rationale
- **One sanctioned, auditable path:** every open/close is a workflow run with an actor and timestamp — better than ad-hoc SSH tunnels or console SG edits
- **Fails closed twice over:** the nightly scheduled disable, and the SG rule living outside Terraform means any `terraform apply` reverts it to closed
- **Scoped blast radius:** caller CIDR only, password auth still applies while exposed (the official image's `pg_hba.conf` requires `scram-sha-256` for remote hosts)
- **Why not the SSH tunnel (option 2):** it works today with zero changes and remains available as a fallback, but per-session setup friction is exactly what this toggle exists to remove
- **OIDC over stored keys:** consistent with keeping secrets minimal — the deploy pipeline's SSH key stays the only long-lived credential

## Tradeoffs
- A deliberate, contained hole in ADR-003's "never internet-reachable" posture — while enabled, the DB is one password away from the caller's network
- New AWS surface: a GitHub OIDC identity provider + IAM role in Terraform, solely for this workflow
- The nightly failsafe means a developer's long session can be cut off at the scheduled disable
- Out-of-band SG mutation causes Terraform drift while enabled (accepted: drift resolves to closed, the safe state)

## Implementation
1. Terraform: GitHub OIDC identity provider + IAM role assumable only by this repo's `db-access.yml` workflow, policy allowing `ec2:AuthorizeSecurityGroupIngress`/`ec2:RevokeSecurityGroupIngress` on the instance's security group only
2. `.github/workflows/db-access.yml`: `workflow_dispatch` with `action` (enable/disable) and required `cidr` inputs; SG call via OIDC-assumed role, then SSH (existing `EC2_HOST`/key secrets) to add/remove the compose override and `up -d`
3. Scheduled nightly job in the same workflow running the `disable` path unconditionally
4. Verify: enable from a dev machine, connect via `db.makejohnacoffee.com:5432`, disable, confirm the port is closed and the SG rule gone; confirm the nightly schedule fires
