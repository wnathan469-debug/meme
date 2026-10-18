\set ON_ERROR_STOP on
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
