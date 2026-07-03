# ADR-003: Database container (simulationDB)

Date: 2026-07-03

## Requirements
- Add a persistent database container alongside the existing containers, per the plan laid out in ADR-002
- Private by design: joins a shared docker network with simulationAPI as its only client — no host ports, never internet-reachable (ADR-002)
- All reads/writes flow through simulationAPI's CRUD layer over HTTPS
- Deploy through the existing pipeline: GHCR image build (or upstream image) + compose file synced to the EC2 box via `.github/workflows/deploy.yml`
- Data must survive container restarts and redeploys (named volume); story needed for surviving a box rebuild (backups)
- Healthcheck so the box and monitoring can check liveness
- Consistent with the tech stack defaults (`docs/steering/tech-stack.md`)

## Options
1. **TBD**
2. **TBD**
3. **TBD**

## Decision
TBD

## Rationale
- TBD

## Tradeoffs
- TBD

## Implementation
1. TBD
