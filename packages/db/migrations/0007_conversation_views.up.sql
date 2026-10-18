BEGIN;
SET LOCAL search_path=memeradar,public;
CREATE TABLE conversation_views (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 owner_user_id uuid NOT NULL, conversation_id text NOT NULL, rule_id uuid NOT NULL,
 reported_reply_count raw_quantity, reported_at timestamptz,
 window_seconds integer CHECK(window_seconds>0), outside_window boolean NOT NULL DEFAULT false,
 quotes_available boolean NOT NULL DEFAULT false,
 last_fetched_at timestamptz, last_error text CHECK(last_error IS NULL OR last_error ~ '^[A-Z_]+$'),
 UNIQUE(data_origin,owner_user_id,conversation_id), UNIQUE(id,data_origin,owner_user_id), UNIQUE(id,data_origin),
 FOREIGN KEY(owner_user_id,data_origin) REFERENCES users(id,data_origin) ON DELETE RESTRICT,
 FOREIGN KEY(conversation_id,data_origin) REFERENCES conversations(conversation_id,data_origin) ON DELETE RESTRICT,
 FOREIGN KEY(rule_id,data_origin,owner_user_id) REFERENCES x_rules(id,data_origin,owner_user_id) ON DELETE RESTRICT
);
CREATE INDEX conversation_views_origin_idx ON conversation_views(data_origin,owner_user_id);
CREATE TRIGGER conversation_views_updated BEFORE UPDATE ON conversation_views FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE conversation_authors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 owner_user_id uuid NOT NULL, view_id uuid NOT NULL, x_user_id text NOT NULL,
 username text NOT NULL, display_name text NOT NULL, observed_at timestamptz NOT NULL,
 CHECK(length(username) BETWEEN 1 AND 80 AND length(display_name)<=200),
 CHECK((data_origin='REAL' AND x_user_id ~ '^[1-9][0-9]{0,31}$' AND username ~ '^[A-Za-z0-9_]{1,15}$') OR (data_origin='DEMO' AND x_user_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$')),
 UNIQUE(data_origin,view_id,x_user_id), UNIQUE(id,data_origin),
 FOREIGN KEY(view_id,data_origin,owner_user_id) REFERENCES conversation_views(id,data_origin,owner_user_id) ON DELETE RESTRICT
);
CREATE INDEX conversation_authors_origin_idx ON conversation_authors(data_origin,owner_user_id);
CREATE TRIGGER conversation_authors_updated BEFORE UPDATE ON conversation_authors FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE conversation_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_views FORCE ROW LEVEL SECURITY;
CREATE POLICY conversation_views_owner ON conversation_views USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE conversation_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_authors FORCE ROW LEVEL SECURITY;
CREATE POLICY conversation_authors_owner ON conversation_authors USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
COMMIT;
