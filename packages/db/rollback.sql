\set ON_ERROR_STOP on
SELECT EXISTS(SELECT 1 FROM memeradar.schema_migrations WHERE version<>'0001_initial') AS has_v2 \gset
\if :has_v2
  \echo 'V2 present: use npm run db:migrate -- --rollback; V1 destruction refused'
  DO $$ BEGIN RAISE EXCEPTION 'V2 rollback requires the versioned runner'; END $$;
\endif
\if :{?confirm_destroy_memeradar}
  \if :confirm_destroy_memeradar
    \ir migrations/0001_initial.down.sql
  \else
    \echo 'Rollback refused: explicit confirmation required'
    DO $$ BEGIN RAISE EXCEPTION 'Migration precondition failed'; END $$;
  \endif
\else
  \echo 'Rollback refused: use -v confirm_destroy_memeradar=true on a disposable database only'
  DO $$ BEGIN RAISE EXCEPTION 'Migration precondition failed'; END $$;
\endif
