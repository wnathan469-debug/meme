BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
LOCK TABLE provider_controls,provider_diagnostics IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM provider_controls) OR EXISTS(SELECT 1 FROM provider_diagnostics) THEN RAISE EXCEPTION 'Rollback refused: provider controls/diagnostics are in use'; END IF;
END $$;
DROP TABLE provider_diagnostics,provider_controls;
COMMIT;
