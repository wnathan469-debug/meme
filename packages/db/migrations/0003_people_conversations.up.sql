-- Additive V2 migration. SQL is authoritative; run through the checksum-aware runner.
BEGIN;
SET LOCAL search_path=memeradar,public;
CREATE TABLE person_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
owner_user_id uuid NOT NULL, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 UNIQUE(data_origin,owner_user_id,name), UNIQUE(id,data_origin,owner_user_id), FOREIGN KEY(owner_user_id,data_origin) REFERENCES users(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX person_categories_origin_idx ON person_categories(data_origin);
CREATE TRIGGER person_categories_updated BEFORE UPDATE ON person_categories FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE tracked_people (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
owner_user_id uuid NOT NULL, x_user_id text, requested_username text NOT NULL CHECK(length(requested_username) BETWEEN 1 AND 80),
 display_name_override text, category_id uuid, keywords text[] NOT NULL DEFAULT '{}', private_note text,
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
 status text NOT NULL DEFAULT 'paused' CHECK(status IN ('active','paused')),
 validation_status text NOT NULL DEFAULT 'unvalidated' CHECK(validation_status IN ('validated_via_api','unvalidated','not_found','suspended_or_unavailable')),
 validated_at timestamptz, added_at timestamptz NOT NULL DEFAULT now(),
 CHECK(validation_status<>'validated_via_api' OR (x_user_id IS NOT NULL AND validated_at IS NOT NULL)),
 CHECK(data_origin<>'REAL' OR requested_username ~ '^[A-Za-z0-9_]{1,15}$'),
 FOREIGN KEY(owner_user_id,data_origin) REFERENCES users(id,data_origin) ON DELETE RESTRICT, FOREIGN KEY(x_user_id,data_origin) REFERENCES x_users(x_user_id,data_origin) ON DELETE RESTRICT,
 FOREIGN KEY(category_id,data_origin,owner_user_id) REFERENCES person_categories(id,data_origin,owner_user_id),
 UNIQUE(id,data_origin)
);
CREATE INDEX tracked_people_origin_idx ON tracked_people(data_origin);
CREATE TRIGGER tracked_people_updated BEFORE UPDATE ON tracked_people FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
conversation_id text NOT NULL, root_post_id uuid,
 reported_reply_count raw_quantity, retrieved_reply_count raw_quantity NOT NULL DEFAULT 0,
 coverage_ratio numeric GENERATED ALWAYS AS (CASE WHEN reported_reply_count>0 THEN LEAST(1::numeric,retrieved_reply_count/reported_reply_count) ELSE NULL END) STORED,
 coverage_status text NOT NULL DEFAULT 'partial' CHECK(coverage_status IN ('complete_as_far_as_known','partial','outside_api_window','unavailable')),
 last_fetched_at timestamptz, fetch_cost_estimate raw_quantity, UNIQUE(data_origin,conversation_id),
 CHECK ((data_origin='REAL' AND conversation_id ~ '^[1-9][0-9]{0,31}$') OR (data_origin='DEMO' AND conversation_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$')), FOREIGN KEY(root_post_id,data_origin) REFERENCES x_posts(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX conversations_origin_idx ON conversations(data_origin);
CREATE TRIGGER conversations_updated BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_post_references (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
post_id uuid NOT NULL, referenced_x_post_id text NOT NULL,
 reference_type text NOT NULL CHECK(reference_type IN ('replied_to','quoted','retweeted')),
 UNIQUE(data_origin,post_id,referenced_x_post_id,reference_type), CHECK ((data_origin='REAL' AND referenced_x_post_id ~ '^[1-9][0-9]{0,31}$') OR (data_origin='DEMO' AND referenced_x_post_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$')), FOREIGN KEY(post_id,data_origin) REFERENCES x_posts(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX x_post_references_origin_idx ON x_post_references(data_origin);
CREATE TRIGGER x_post_references_updated BEFORE UPDATE ON x_post_references FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE UNIQUE INDEX tracked_people_identity_idx ON tracked_people(data_origin,owner_user_id,x_user_id) WHERE x_user_id IS NOT NULL;
CREATE UNIQUE INDEX tracked_people_pending_idx ON tracked_people(data_origin,owner_user_id,lower(requested_username)) WHERE x_user_id IS NULL;
CREATE INDEX tracked_people_owner_idx ON tracked_people(data_origin,owner_user_id,status,priority);
CREATE INDEX x_post_references_target_idx ON x_post_references(data_origin,referenced_x_post_id);
CREATE INDEX conversations_root_idx ON conversations(data_origin,root_post_id);
CREATE FUNCTION validate_conversation_root() RETURNS trigger LANGUAGE plpgsql SET search_path=memeradar,pg_temp AS $$
BEGIN
 IF NEW.root_post_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM x_posts WHERE id=NEW.root_post_id AND data_origin=NEW.data_origin AND x_post_id=NEW.conversation_id) THEN
 RAISE EXCEPTION 'Conversation root mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER conversations_root_validate BEFORE INSERT OR UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION validate_conversation_root();

ALTER TABLE person_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY person_categories_owner ON person_categories USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE tracked_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_people FORCE ROW LEVEL SECURITY;
CREATE POLICY tracked_people_owner ON tracked_people USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
COMMIT;
