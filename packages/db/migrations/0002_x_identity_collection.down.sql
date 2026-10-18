-- Conservative rollback: never discard V2 rows implicitly.
BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
LOCK TABLE x_post_collections,x_collection_checkpoints,x_post_rules,x_collection_runs,x_rules,x_post_metrics_history,x_posts,x_username_history,x_users IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM x_post_collections) THEN RAISE EXCEPTION 'Rollback refused: x_post_collections contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_users) THEN RAISE EXCEPTION 'Rollback refused: x_users contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_username_history) THEN RAISE EXCEPTION 'Rollback refused: x_username_history contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_posts) THEN RAISE EXCEPTION 'Rollback refused: x_posts contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_post_metrics_history) THEN RAISE EXCEPTION 'Rollback refused: x_post_metrics_history contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_rules) THEN RAISE EXCEPTION 'Rollback refused: x_rules contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_collection_runs) THEN RAISE EXCEPTION 'Rollback refused: x_collection_runs contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_post_rules) THEN RAISE EXCEPTION 'Rollback refused: x_post_rules contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_collection_checkpoints) THEN RAISE EXCEPTION 'Rollback refused: x_collection_checkpoints contains V2 data'; END IF;

END $$;

DROP TABLE x_post_collections;
DROP TRIGGER x_posts_identity ON x_posts;
DROP TRIGGER x_users_identity ON x_users;
DROP FUNCTION protect_x_identity();
DROP TABLE x_collection_checkpoints;
DROP TABLE x_post_rules;
DROP TABLE x_collection_runs;
DROP TABLE x_rules;
DROP TABLE x_post_metrics_history;
DROP TABLE x_posts;
DROP FUNCTION valid_x_references(jsonb,data_origin);
DROP TABLE x_username_history;
DROP TABLE x_users;
COMMIT;
