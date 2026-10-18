-- DESTRUCTIVE: removes all MemeRadar data. Explicit development rollback only.
BEGIN;
SELECT pg_advisory_xact_lock(716202603);
DROP SCHEMA memeradar CASCADE;
-- pg_trgm is intentionally preserved: it may be used by other schemas.
COMMIT;
