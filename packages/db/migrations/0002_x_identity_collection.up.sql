-- Additive V2 migration. SQL is authoritative; run through the checksum-aware runner.
BEGIN;
SET LOCAL search_path=memeradar,public;
CREATE TABLE x_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
x_user_id text NOT NULL, username text NOT NULL CHECK(length(username) BETWEEN 1 AND 80),
 display_name text NOT NULL, protected boolean, verified_type text,
 public_metrics jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(public_metrics)='object'), followers_count raw_quantity, metrics_observed_at timestamptz,
 profile_url http_url, first_seen_at timestamptz NOT NULL DEFAULT now(), last_refreshed_at timestamptz,
 is_tracked boolean NOT NULL DEFAULT false, UNIQUE(data_origin,x_user_id), CHECK ((data_origin='REAL' AND x_user_id ~ '^[1-9][0-9]{0,31}$') OR (data_origin='DEMO' AND x_user_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$')),
 CHECK(data_origin<>'REAL' OR username ~ '^[A-Za-z0-9_]{1,15}$'),
 CHECK(data_origin<>'DEMO' OR profile_url ~ '^https://demo[.]memeradar[.]invalid(/|$)'),
 UNIQUE(id,data_origin)
);
CREATE INDEX x_users_origin_idx ON x_users(data_origin);
CREATE TRIGGER x_users_updated BEFORE UPDATE ON x_users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_username_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
x_user_id text NOT NULL, username text NOT NULL, observed_at timestamptz NOT NULL,
 UNIQUE(data_origin,x_user_id,username,observed_at), FOREIGN KEY(x_user_id,data_origin) REFERENCES x_users(x_user_id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX x_username_history_origin_idx ON x_username_history(data_origin);
CREATE TRIGGER x_username_history_updated BEFORE UPDATE ON x_username_history FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
x_post_id text NOT NULL, author_x_user_id text, text text, lang text,
 published_at timestamptz, collected_at timestamptz NOT NULL DEFAULT now(),
 collection_mode text NOT NULL CHECK(collection_mode IN ('stream','search','user_timeline','conversation','lookup','quotes')),
 conversation_id text, in_reply_to_post_id text,
 post_type text NOT NULL DEFAULT 'unknown' CHECK(post_type IN ('original','reply','quote','repost','unknown')),
 referenced_post_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(referenced_post_ids)='array'),
 public_metrics jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(public_metrics)='object'), metrics_observed_at timestamptz,
 entities jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(entities)='object'),
 detected_contract_addresses jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(detected_contract_addresses)='array'),
 availability_status text NOT NULL DEFAULT 'unknown' CHECK(availability_status IN ('available','deleted','withheld','unknown')),
 availability_checked_at timestamptz, UNIQUE(data_origin,x_post_id),
 CHECK ((data_origin='REAL' AND x_post_id ~ '^[1-9][0-9]{0,31}$') OR (data_origin='DEMO' AND x_post_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$')), CHECK ((data_origin='REAL' AND author_x_user_id ~ '^[1-9][0-9]{0,31}$') OR (data_origin='DEMO' AND author_x_user_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$')), CHECK ((data_origin='REAL' AND conversation_id ~ '^[1-9][0-9]{0,31}$') OR (data_origin='DEMO' AND conversation_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$')), CHECK ((data_origin='REAL' AND in_reply_to_post_id ~ '^[1-9][0-9]{0,31}$') OR (data_origin='DEMO' AND in_reply_to_post_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$')),
 CHECK(availability_status<>'available' OR text IS NOT NULL),
 FOREIGN KEY(author_x_user_id,data_origin) REFERENCES x_users(x_user_id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX x_posts_origin_idx ON x_posts(data_origin);
CREATE TRIGGER x_posts_updated BEFORE UPDATE ON x_posts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_post_metrics_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
post_id uuid NOT NULL, observed_at timestamptz NOT NULL,
 likes raw_quantity, replies raw_quantity, reposts raw_quantity, quotes raw_quantity,
 UNIQUE(data_origin,post_id,observed_at), FOREIGN KEY(post_id,data_origin) REFERENCES x_posts(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX x_post_metrics_history_origin_idx ON x_post_metrics_history(data_origin);
CREATE TRIGGER x_post_metrics_history_updated BEFORE UPDATE ON x_post_metrics_history FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
owner_user_id uuid NOT NULL, name text NOT NULL, expression jsonb NOT NULL CHECK(jsonb_typeof(expression)='object'), query text NOT NULL,
 stream_rule_id text, priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
 poll_interval_seconds integer NOT NULL DEFAULT 300 CHECK(poll_interval_seconds BETWEEN 1 AND 86400),
 status text NOT NULL DEFAULT 'paused' CHECK(status IN ('active','paused')), allocated_daily_micros raw_quantity,
 UNIQUE(id,data_origin,owner_user_id), FOREIGN KEY(owner_user_id,data_origin) REFERENCES users(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX x_rules_origin_idx ON x_rules(data_origin);
CREATE TRIGGER x_rules_updated BEFORE UPDATE ON x_rules FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_collection_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
rule_id uuid, mode text NOT NULL CHECK(mode IN ('stream','search','user_timeline','conversation','lookup','quotes')),
 started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','interrupted')),
 retrieved_count integer NOT NULL DEFAULT 0 CHECK(retrieved_count>=0), new_count integer NOT NULL DEFAULT 0 CHECK(new_count>=0),
 duplicate_count integer NOT NULL DEFAULT 0 CHECK(duplicate_count>=0), error_count integer NOT NULL DEFAULT 0 CHECK(error_count>=0),
 estimated_cost_micros raw_quantity, error_code text CHECK(error_code IS NULL OR error_code ~ '^[A-Z_]+$'),
 CHECK(new_count+duplicate_count<=retrieved_count), CHECK(ended_at IS NULL OR ended_at>=started_at),
 FOREIGN KEY(rule_id,data_origin) REFERENCES x_rules(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX x_collection_runs_origin_idx ON x_collection_runs(data_origin);
CREATE TRIGGER x_collection_runs_updated BEFORE UPDATE ON x_collection_runs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_post_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
post_id uuid NOT NULL, rule_id uuid NOT NULL, matched_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(data_origin,post_id,rule_id), FOREIGN KEY(post_id,data_origin) REFERENCES x_posts(id,data_origin) ON DELETE RESTRICT, FOREIGN KEY(rule_id,data_origin) REFERENCES x_rules(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX x_post_rules_origin_idx ON x_post_rules(data_origin);
CREATE TRIGGER x_post_rules_updated BEFORE UPDATE ON x_post_rules FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_collection_checkpoints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
rule_id uuid NOT NULL, mode text NOT NULL CHECK(mode IN ('stream','search','user_timeline','conversation','lookup','quotes')),
 since_id text, next_token text, last_success_at timestamptz, lease_until timestamptz,
 UNIQUE(data_origin,rule_id,mode), CHECK ((data_origin='REAL' AND since_id ~ '^[1-9][0-9]{0,31}$') OR (data_origin='DEMO' AND since_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$')), FOREIGN KEY(rule_id,data_origin) REFERENCES x_rules(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX x_collection_checkpoints_origin_idx ON x_collection_checkpoints(data_origin);
CREATE TRIGGER x_collection_checkpoints_updated BEFORE UPDATE ON x_collection_checkpoints FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX x_posts_time_idx ON x_posts(data_origin,published_at DESC);
CREATE INDEX x_posts_author_idx ON x_posts(data_origin,author_x_user_id,published_at DESC);
CREATE INDEX x_posts_conversation_idx ON x_posts(data_origin,conversation_id);
CREATE INDEX x_posts_text_idx ON x_posts USING gin(to_tsvector('simple',coalesce(text,'')));
CREATE INDEX x_rules_active_idx ON x_rules(data_origin,priority,status);
CREATE INDEX x_collection_runs_rule_idx ON x_collection_runs(data_origin,rule_id,started_at DESC);


CREATE TABLE x_post_collections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 post_id uuid NOT NULL, run_id uuid NOT NULL,
 UNIQUE(id,data_origin), UNIQUE(data_origin,post_id,run_id),
 FOREIGN KEY(post_id,data_origin) REFERENCES x_posts(id,data_origin),
 FOREIGN KEY(run_id,data_origin) REFERENCES x_collection_runs(id,data_origin)
);
CREATE INDEX x_post_collections_origin_idx ON x_post_collections(data_origin);
CREATE TRIGGER x_post_collections_updated BEFORE UPDATE ON x_post_collections FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE FUNCTION protect_x_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=memeradar,pg_temp AS $$
BEGIN
 IF (to_jsonb(NEW)->>TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD)->>TG_ARGV[0]) THEN
 RAISE EXCEPTION 'X immutable identity cannot change' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER x_users_identity BEFORE UPDATE ON x_users FOR EACH ROW EXECUTE FUNCTION protect_x_identity('x_user_id');
CREATE TRIGGER x_posts_identity BEFORE UPDATE ON x_posts FOR EACH ROW EXECUTE FUNCTION protect_x_identity('x_post_id');
ALTER TABLE x_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY x_rules_owner ON x_rules USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
CREATE FUNCTION valid_x_references(value jsonb,origin data_origin) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=memeradar,pg_temp AS $$
DECLARE element jsonb; reference_id text;
BEGIN
 IF jsonb_typeof(value)<>'array' THEN RETURN false; END IF;
 FOR element IN SELECT * FROM jsonb_array_elements(value) LOOP
  IF jsonb_typeof(element)<>'object' OR jsonb_typeof(element->'id') IS DISTINCT FROM 'string' OR (element->>'type') IS NULL OR (element->>'type') NOT IN ('replied_to','quoted','retweeted') THEN RETURN false; END IF;
  reference_id=element->>'id';
  IF (origin='REAL' AND reference_id !~ '^[1-9][0-9]{0,31}$') OR (origin='DEMO' AND reference_id !~ '^DEMO_[a-zA-Z0-9_]{1,80}$') THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
ALTER TABLE x_posts ADD CONSTRAINT x_posts_typed_references CHECK(valid_x_references(referenced_post_ids,data_origin));
COMMIT;
