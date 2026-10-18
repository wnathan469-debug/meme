BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
LOCK TABLE x_collection_checkpoints,x_collection_runs,x_posts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM x_collection_checkpoints WHERE lease_id IS NOT NULL OR pending_since_id IS NOT NULL OR query_hash IS NOT NULL)
 OR EXISTS(SELECT 1 FROM x_collection_runs WHERE partial OR gap_started_at IS NOT NULL OR gap_ended_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM x_posts WHERE unresolved_author_x_user_id IS NOT NULL OR text_fingerprint IS NOT NULL) THEN RAISE EXCEPTION 'Rollback refused: collector state is in use'; END IF;
END $$;
ALTER TABLE x_collection_checkpoints DROP COLUMN lease_id,DROP COLUMN pending_since_id,DROP COLUMN query_hash,DROP COLUMN next_due_at;
ALTER TABLE x_collection_runs DROP COLUMN partial,DROP COLUMN gap_started_at,DROP COLUMN gap_ended_at;
ALTER TABLE x_posts DROP COLUMN unresolved_author_x_user_id,DROP COLUMN text_fingerprint;
COMMIT;
