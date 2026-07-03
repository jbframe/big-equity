# ADR-004: simulationDB backup restore verification

Date: 2026-07-03

Status: **Accepted** — the first restore drill was executed 2026-07-03 (ADR-003 step 12) before any real data landed; this ADR records the proven runbook and the re-verification policy.

## Requirements
- Prove the ADR-003 backup artifacts (weekly `pg_dump` gzips in S3) actually restore — an untested backup is not a backup
- Restore must be exercised against a disposable target (scratch container or local Postgres), never the live simulationDB
- Produce a runbook: exact commands from S3 object → running database, covering the box-rebuild scenario the backups exist for (`aws s3 cp` + `gunzip | psql` as the starting point)
- Restore target must match the production major version (`postgres:18-alpine`, ADR-003) — a dump restored into a different major proves less
- Decide whether verification is one-off or recurring (e.g. re-proven after Postgres major upgrades, or a scheduled restore drill)

## Options
1. **One-off proof + runbook, re-proven on trigger events** — run the drill by hand against a throwaway container, commit the exact commands here, and repeat only when something that could break restores changes (Postgres major upgrade, backup script change, deliberate box rebuild with data worth keeping)
2. **Scheduled automated restore drill** — a recurring GitHub workflow (or cron on the box) that pulls the latest dump, restores it into a scratch container, and asserts on row counts
3. **Verify-on-backup only** — extend the weekly backup cron with an integrity check (`gzip -t`, or restore-and-count on the box) so every artifact is validated at creation time

## Decision
Option 1 — a manual drill with the runbook below, executed once (2026-07-03, successfully) and re-run on trigger events:

- after any Postgres **major** version bump (on-disk format and dump/psql compatibility change)
- after any change to `simulationdb-backup.sh` or the backup cron (in `infra/user_data.sh.tftpl`)
- before a deliberate box rebuild (`terraform apply -replace=aws_instance.app`) once the database holds data anyone would miss

## Rationale
- **The path is now proven, not assumed.** The 2026-07-03 drill took the real artifact (`s3://big-equity-db-backups-jbframe/simulationdb/2026-07-03.sql.gz`, written by the production backup script run manually on the box) and restored it into a throwaway local `postgres:18-alpine` container; the row came back byte-identical and the `drizzle.__drizzle_migrations` journal was intact, so a restored database looks fully migrated to simulationAPI's startup migrator
- **Automation buys little at this scale.** The dump is plain SQL measured in kilobytes and the restore is four commands; a scheduled drill (option 2) would mostly re-prove an unchanged path while adding a workflow, credentials, and alerting to maintain. The trigger events are exactly the moments the path can actually break
- **Verify-on-backup can't run here anyway.** The instance role is deliberately `s3:PutObject`-only (`infra/db_backups.tf`) — the box can write dumps but cannot read them back, so an on-box restore check (option 3) would mean widening the role and weakening the write-only containment
- **Recurrence is policy, not plumbing.** Nothing stops running the drill more often; the decision only says when it *must* happen

## Tradeoffs
- **Trigger-event discipline is on us.** No schedule means no automatic reminder — a forgotten drill after a major upgrade is silent until a real restore fails. Mitigated by listing the drill in the upgrade path (ADR-003 already flags major upgrades as manual work)
- **Restores always need operator credentials.** Write-only backups from the box mean disaster recovery cannot be self-service from EC2 — someone with `s3:GetObject` on the bucket runs it from a workstation. That is the intended containment (a compromised box can't read or tamper with history), but it puts a human with AWS access on the critical path
- **Each artifact is unverified until a drill touches it.** Between drills, a corrupted upload would go unnoticed; at kilobyte sizes and weekly cadence the exposure window is small, and `gzip -t` on download catches truncation before a restore attempt

## Implementation

### Runbook: restore drill (disposable target) — proven 2026-07-03

Run from a workstation with `s3:GetObject`/`s3:ListBucket` on the backup bucket (the box cannot — its role is PutObject-only):

```bash
# 1. Fetch the artifact
aws s3 ls s3://big-equity-db-backups-jbframe/simulationdb/
aws s3 cp s3://big-equity-db-backups-jbframe/simulationdb/<DATE>.sql.gz .
gzip -t <DATE>.sql.gz && gunzip <DATE>.sql.gz

# 2. Disposable target on the production major (postgres:18-alpine)
docker run -d --name restore-test -e POSTGRES_PASSWORD=throwaway postgres:18-alpine
until docker exec restore-test pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

# 3. The dump carries OWNER statements for the production role — create it first,
#    or the restore fails with: role "simulation" does not exist
docker exec restore-test psql -U postgres -c 'CREATE ROLE simulation LOGIN'
docker exec restore-test psql -U postgres -c 'CREATE DATABASE restore_test OWNER simulation'

# 4. Restore and verify
docker exec -i restore-test psql -U postgres -d restore_test -v ON_ERROR_STOP=1 < <DATE>.sql
docker exec restore-test psql -U postgres -d restore_test \
  -c 'SELECT count(*) FROM simulation_results;' \
  -c 'SELECT count(*) FROM drizzle.__drizzle_migrations;'

# 5. Tear down
docker rm -f restore-test
```

### Runbook: real disaster (box rebuild destroyed the volume)

After the rebuild, the deploy pipeline brings up an **empty** simulationDB and simulationAPI's startup migrations recreate the schema — so the target database is not empty and a naive pipe will collide with existing tables. Drop and recreate first:

```bash
# On a workstation: fetch the latest dump (step 1 above), then copy it to the box
scp -i ~/.ssh/ec2_deploy_key <DATE>.sql ec2-user@<EIP>:/tmp/

# On the box: recreate the database, restore, restart the API
ssh -i ~/.ssh/ec2_deploy_key ec2-user@<EIP>
. ~/containers/simulationDB/.env
docker exec simulationdb psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE \"$POSTGRES_DB\"" -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""
docker exec -i simulationdb psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 </tmp/<DATE>.sql
rm /tmp/<DATE>.sql
cd ~/containers/simulationAPI && docker compose restart
```

No role creation is needed here — production's `$POSTGRES_USER` *is* `simulation`. The restored `drizzle.__drizzle_migrations` journal means the API's startup migrator sees the schema as up to date and boots clean.

### Notes from the 2026-07-03 drill
- The dump is emitted by `pg_dump` 18 and includes an 18-era `\restrict` preamble — restore with a `psql` of at least the same major (another reason the target must match production's major, and a thing to re-check at the next major upgrade)
- Restore client compatibility, the OWNER gotcha, and the migrations-journal behaviour are exactly the kind of details a major upgrade can change — they are the checklist for the next triggered drill
