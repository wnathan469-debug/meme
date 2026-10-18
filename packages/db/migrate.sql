\set ON_ERROR_STOP on
-- Session lock also protects the version check against concurrent migrators.
SELECT pg_advisory_lock(716202603);
SELECT to_regclass('memeradar.schema_migrations') IS NULL AS needs_initial \gset
\if :needs_initial
  \ir migrations/0001_initial.up.sql
\else
  SELECT EXISTS(SELECT 1 FROM memeradar.schema_migrations WHERE version='0001_initial') AS known_version \gset
  \if :known_version
    \echo '0001_initial already applied'
  \else
    \echo 'Unrecognised migration ledger; refusing to continue'
    DO $$ BEGIN RAISE EXCEPTION 'Migration precondition failed'; END $$;
  \endif
\endif
SELECT pg_advisory_unlock(716202603);
