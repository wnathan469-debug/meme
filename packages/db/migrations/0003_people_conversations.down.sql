-- Conservative rollback: never discard V2 rows implicitly.
BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
LOCK TABLE x_post_references,conversations,tracked_people,person_categories IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM person_categories) THEN RAISE EXCEPTION 'Rollback refused: person_categories contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM tracked_people) THEN RAISE EXCEPTION 'Rollback refused: tracked_people contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM conversations) THEN RAISE EXCEPTION 'Rollback refused: conversations contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_post_references) THEN RAISE EXCEPTION 'Rollback refused: x_post_references contains V2 data'; END IF;

END $$;
DROP TRIGGER conversations_root_validate ON conversations;
DROP FUNCTION validate_conversation_root();
DROP TABLE x_post_references;
DROP TABLE conversations;
DROP TABLE tracked_people;
DROP TABLE person_categories;
COMMIT;
