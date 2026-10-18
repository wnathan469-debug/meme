BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
LOCK TABLE conversation_views,conversation_authors IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM conversation_views) OR EXISTS(SELECT 1 FROM conversation_authors) THEN RAISE EXCEPTION 'Rollback refused: conversation views are in use'; END IF;
END $$;
DROP TABLE conversation_authors,conversation_views;
COMMIT;
