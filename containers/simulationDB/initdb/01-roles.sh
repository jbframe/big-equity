#!/bin/bash
# First-boot role separation (ADR-008). The postgres image runs this only when
# initializing an EMPTY data volume — an existing cluster never re-runs it,
# which is fine: the role model ships via box rebuild, not in-place migration.
#
# initdb creates $POSTGRES_USER (dbadmin) as the cluster superuser; this adds
# the two per-database manager roles. Each can log in, owns exactly its own
# database, and cannot connect to the other's. The *_ROLE_PASSWORD vars come
# from the .env the deploy pipeline writes next to the compose file.
set -euo pipefail

psql -v ON_ERROR_STOP=1 \
  -v simulation_password="$SIMULATION_ROLE_PASSWORD" \
  -v fusionauth_password="$FUSIONAUTH_ROLE_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE ROLE simulation WITH LOGIN PASSWORD :'simulation_password';
CREATE ROLE fusionauth WITH LOGIN PASSWORD :'fusionauth_password';

-- initdb created $POSTGRES_DB (simulation) owned by the superuser; hand it to
-- its manager. The fusionauth database is created here rather than left to
-- FusionAuth's first boot so the grants below never race it.
ALTER DATABASE simulation OWNER TO simulation;
CREATE DATABASE fusionauth OWNER fusionauth;

-- Fence the managers into their own databases: by default any role may
-- connect anywhere (PUBLIC has CONNECT). dbadmin is unaffected — superuser
-- bypasses these checks — so backups and FusionAuth schema upgrades still work.
REVOKE CONNECT ON DATABASE simulation FROM PUBLIC;
REVOKE CONNECT ON DATABASE fusionauth FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
GRANT CONNECT ON DATABASE simulation TO simulation;
GRANT CONNECT ON DATABASE fusionauth TO fusionauth;
EOSQL
