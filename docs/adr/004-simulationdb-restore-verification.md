# ADR-004: simulationDB backup restore verification (DRAFT)

Date: 2026-07-03

Status: **Draft / TODO** — must be decided and implemented before real data lands in simulationDB (ADR-003).

## Requirements
- Prove the ADR-003 backup artifacts (weekly `pg_dump` gzips in S3) actually restore — an untested backup is not a backup
- Restore must be exercised against a disposable target (scratch container or local Postgres), never the live simulationDB
- Produce a runbook: exact commands from S3 object → running database, covering the box-rebuild scenario the backups exist for (`aws s3 cp` + `gunzip | psql` as the starting point)
- Restore target must match the production major version (`postgres:18-alpine`, ADR-003) — a dump restored into a different major proves less
- Decide whether verification is one-off or recurring (e.g. re-proven after Postgres major upgrades, or a scheduled restore drill)

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
