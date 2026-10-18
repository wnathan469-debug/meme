BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
LOCK TABLE social_token_candidates,social_contract_attestations,post_token_mentions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM social_token_candidates) OR EXISTS(SELECT 1 FROM social_contract_attestations) OR EXISTS(SELECT 1 FROM post_token_mentions WHERE owner_user_id IS NOT NULL OR algorithm_version<>'legacy' OR evidence<>'{}') THEN RAISE EXCEPTION 'Rollback refused: social token evidence is in use'; END IF;
END $$;
DROP POLICY post_token_mentions_read ON post_token_mentions;
DROP POLICY post_token_mentions_write ON post_token_mentions;
ALTER TABLE post_token_mentions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE post_token_mentions DISABLE ROW LEVEL SECURITY;
ALTER TABLE post_token_mentions DROP CONSTRAINT post_token_mentions_scope_key,DROP CONSTRAINT post_token_mentions_owner_fk,DROP COLUMN owner_user_id,DROP COLUMN algorithm_version,DROP COLUMN evidence;
ALTER TABLE post_token_mentions ADD CONSTRAINT post_token_mentions_legacy_key UNIQUE(data_origin,post_id,token_id,detection_method);
DROP TABLE social_contract_attestations,social_token_candidates;
COMMIT;
