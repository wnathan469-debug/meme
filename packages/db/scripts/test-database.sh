#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
container="memeradar-db-test-$$"
task_tmp="$(mktemp -d)"
image='postgres:16-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4'
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$task_tmp"
}
trap cleanup EXIT
# Trust authentication is restricted to this network-less disposable container.
docker run -d --name "$container" --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=memeradar_test "$image" >/dev/null
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$container" pg_isready -U postgres -d memeradar_test >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  docker logs "$container"
  exit 1
fi
docker cp "$repo_root/packages/db" "$container:/tmp/db" >/dev/null
docker cp "$repo_root/tests/integration/database.sql" "$container:/tmp/database.sql" >/dev/null
psql_test() {
  docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d memeradar_test "$@"
}
psql_test -f /tmp/db/migrate.sql
psql_test -f /tmp/db/migrate.sql
psql_test -f /tmp/database.sql
# Without confirmation, rollback must fail and leave the schema intact.
if psql_test -f /tmp/db/rollback.sql >"$task_tmp/guard.log" 2>&1; then
  echo 'FAIL: unconfirmed destructive rollback succeeded' >&2
  exit 1
else
  guard_status=$?
  [[ "$guard_status" -eq 3 ]] || { cat "$task_tmp/guard.log"; exit 1; }
fi
[[ "$(psql_test -Atc "SELECT count(*) FROM memeradar.schema_migrations")" == 1 ]]
psql_test -v confirm_destroy_memeradar=true -f /tmp/db/rollback.sql >"$task_tmp/rollback.log" 2>&1
[[ "$(psql_test -Atc "SELECT to_regnamespace('memeradar') IS NULL")" == t ]]
[[ "$(psql_test -Atc "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_trgm')")" == t ]]
psql_test -f /tmp/db/migrate.sql
psql_test -f /tmp/database.sql
# A failing initial migration must roll back its schema, types and ledger.
docker exec "$container" createdb -U postgres memeradar_failure
sed '/^COMMIT;$/i SELECT 1/0;' "$repo_root/packages/db/migrations/0001_initial.up.sql" >"$task_tmp/broken.sql"
docker cp "$task_tmp/broken.sql" "$container:/tmp/broken.sql" >/dev/null
if docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d memeradar_failure -f /tmp/broken.sql >"$task_tmp/failure.log" 2>&1; then
  echo 'FAIL: deliberately broken migration succeeded' >&2
  exit 1
fi
[[ "$(docker exec "$container" psql -X -At -U postgres -d memeradar_failure -c "SELECT to_regnamespace('memeradar') IS NULL")" == t ]]
# Concurrent migrators serialize their version checks and both succeed.
docker exec "$container" psql -X -q -U postgres -d memeradar_failure -f /tmp/db/migrate.sql >"$task_tmp/migrate-a.log" 2>&1 &
first_pid=$!
docker exec "$container" psql -X -q -U postgres -d memeradar_failure -f /tmp/db/migrate.sql >"$task_tmp/migrate-b.log" 2>&1 &
second_pid=$!
if ! wait "$first_pid"; then cat "$task_tmp/migrate-a.log"; exit 1; fi
if ! wait "$second_pid"; then cat "$task_tmp/migrate-b.log"; exit 1; fi
[[ "$(docker exec "$container" psql -X -At -U postgres -d memeradar_failure -c "SELECT count(*) FROM memeradar.schema_migrations")" == 1 ]]
echo 'PASS: 51 integrity checks before and after rollback; repeatability, rollback guard, atomic failure and concurrent migration.'
