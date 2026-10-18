BEGIN;
SET LOCAL search_path=memeradar,public;
ALTER TABLE post_token_mentions ADD COLUMN owner_user_id uuid,ADD COLUMN algorithm_version text NOT NULL DEFAULT 'legacy',ADD COLUMN evidence jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(evidence)='object'),
 ADD CONSTRAINT post_token_mentions_owner_fk FOREIGN KEY(owner_user_id,data_origin) REFERENCES users(id,data_origin);
DO $$ DECLARE n text; BEGIN
 SELECT conname INTO STRICT n FROM pg_constraint WHERE conrelid='post_token_mentions'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (data_origin, post_id, token_id, detection_method)';
 EXECUTE format('ALTER TABLE post_token_mentions DROP CONSTRAINT %I',n);
END $$;
ALTER TABLE post_token_mentions ADD CONSTRAINT post_token_mentions_scope_key UNIQUE NULLS NOT DISTINCT(data_origin,owner_user_id,post_id,token_id,detection_method);
CREATE TABLE social_token_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data_origin data_origin NOT NULL,knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 owner_user_id uuid NOT NULL,post_id uuid NOT NULL,candidates jsonb NOT NULL CHECK(jsonb_typeof(candidates)='array'),algorithm_version text NOT NULL,evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 UNIQUE(data_origin,owner_user_id,post_id),UNIQUE(id,data_origin),
 FOREIGN KEY(owner_user_id,data_origin) REFERENCES users(id,data_origin),FOREIGN KEY(post_id,data_origin) REFERENCES x_posts(id,data_origin)
);
CREATE TABLE social_contract_attestations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data_origin data_origin NOT NULL,knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 owner_user_id uuid NOT NULL,watch_id uuid NOT NULL,watch_revision integer NOT NULL CHECK(watch_revision>0),event_id uuid NOT NULL,token_id uuid NOT NULL,post_id uuid NOT NULL,author_x_user_id text NOT NULL,evidence_url http_url NOT NULL,reviewed_at timestamptz NOT NULL,
 purpose text NOT NULL CHECK(purpose='contract_publication'),evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 UNIQUE(data_origin,owner_user_id,event_id,token_id,post_id),UNIQUE(id,data_origin),
 FOREIGN KEY(watch_id,data_origin,owner_user_id,event_id) REFERENCES event_watches(id,data_origin,owner_user_id,event_id),
 FOREIGN KEY(token_id,data_origin) REFERENCES tokens(id,data_origin),FOREIGN KEY(post_id,data_origin) REFERENCES x_posts(id,data_origin),
 CHECK(data_origin<>'DEMO' OR evidence_url ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);
CREATE INDEX social_token_candidates_origin_idx ON social_token_candidates(data_origin,owner_user_id);
CREATE INDEX social_contract_attestations_origin_idx ON social_contract_attestations(data_origin,owner_user_id,event_id,token_id);
CREATE TRIGGER social_token_candidates_updated BEFORE UPDATE ON social_token_candidates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER social_contract_attestations_updated BEFORE UPDATE ON social_contract_attestations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE social_token_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_token_candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY social_token_candidates_owner ON social_token_candidates USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE social_contract_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_contract_attestations FORCE ROW LEVEL SECURITY;
CREATE POLICY social_contract_attestations_owner ON social_contract_attestations USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE post_token_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_token_mentions FORCE ROW LEVEL SECURITY;
CREATE POLICY post_token_mentions_read ON post_token_mentions FOR SELECT USING((owner_user_id IS NULL OR owner_user_id::text=current_setting('memeradar.user_id',true)) AND data_origin::text=current_setting('memeradar.data_origin',true));
CREATE POLICY post_token_mentions_write ON post_token_mentions FOR ALL USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
COMMIT;
