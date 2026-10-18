-- Conservative rollback: never discard V2 rows implicitly.
BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
LOCK TABLE price_candles,token_chart_markers,post_event_links,post_token_mentions,tokens IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM post_token_mentions) THEN RAISE EXCEPTION 'Rollback refused: post_token_mentions contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM post_event_links) THEN RAISE EXCEPTION 'Rollback refused: post_event_links contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM token_chart_markers) THEN RAISE EXCEPTION 'Rollback refused: token_chart_markers contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM price_candles) THEN RAISE EXCEPTION 'Rollback refused: price_candles contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM tokens WHERE first_social_seen_at IS NOT NULL OR first_social_post_id IS NOT NULL) THEN RAISE EXCEPTION 'Rollback refused: social token fields populated'; END IF;
END $$;
ALTER TABLE tokens DROP CONSTRAINT tokens_first_social_post_fk, DROP CONSTRAINT tokens_first_social_pair, DROP COLUMN first_social_post_id, DROP COLUMN first_social_seen_at;
DROP TABLE price_candles;
DROP TABLE token_chart_markers;
DROP TABLE post_event_links;
DROP TABLE post_token_mentions;
ALTER TABLE pools DROP CONSTRAINT pools_id_origin_token_unique;
COMMIT;
