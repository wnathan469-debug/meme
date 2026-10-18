BEGIN;
SET LOCAL search_path=memeradar,public;
CREATE TABLE event_watches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 owner_user_id uuid NOT NULL,event_id uuid NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 terms jsonb NOT NULL CHECK(jsonb_typeof(terms)='array'),official_accounts jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(official_accounts)='array'),
 baseline_buckets integer NOT NULL DEFAULT 6 CHECK(baseline_buckets BETWEEN 3 AND 24),after_buckets integer NOT NULL DEFAULT 12 CHECK(after_buckets BETWEEN 1 AND 48),
 UNIQUE(data_origin,owner_user_id,event_id),UNIQUE(id,data_origin,owner_user_id),UNIQUE(id,data_origin,owner_user_id,event_id),UNIQUE(id,data_origin),
 FOREIGN KEY(owner_user_id,data_origin) REFERENCES users(id,data_origin) ON DELETE RESTRICT,
 FOREIGN KEY(event_id,data_origin) REFERENCES events(id,data_origin) ON DELETE RESTRICT
);
CREATE TABLE event_watch_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 owner_user_id uuid NOT NULL,watch_id uuid NOT NULL,rule_id uuid NOT NULL,rule_query text NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 UNIQUE(watch_id,rule_id,data_origin,owner_user_id),UNIQUE(id,data_origin),
 FOREIGN KEY(watch_id,data_origin,owner_user_id) REFERENCES event_watches(id,data_origin,owner_user_id) ON DELETE RESTRICT,
 FOREIGN KEY(rule_id,data_origin,owner_user_id) REFERENCES x_rules(id,data_origin,owner_user_id) ON DELETE RESTRICT
);
CREATE TABLE event_coverage_windows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 owner_user_id uuid NOT NULL,watch_id uuid NOT NULL,rule_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 status text NOT NULL CHECK(status IN ('observed','partial','gap')),reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 method text NOT NULL CHECK(method IN ('operator_verified','demo_fixture')),
 UNIQUE(id,data_origin),
 FOREIGN KEY(watch_id,rule_id,data_origin,owner_user_id) REFERENCES event_watch_rules(watch_id,rule_id,data_origin,owner_user_id) ON DELETE RESTRICT
);
CREATE INDEX event_watches_origin_idx ON event_watches(data_origin,owner_user_id);
CREATE INDEX event_watch_rules_origin_idx ON event_watch_rules(data_origin,owner_user_id);
CREATE INDEX event_coverage_windows_origin_idx ON event_coverage_windows(data_origin,watch_id,revision,starts_at,ends_at);
CREATE TRIGGER event_watches_updated BEFORE UPDATE ON event_watches FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER event_watch_rules_updated BEFORE UPDATE ON event_watch_rules FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER event_coverage_windows_updated BEFORE UPDATE ON event_coverage_windows FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE post_event_links ADD COLUMN owner_user_id uuid,ADD COLUMN watch_id uuid,ADD COLUMN watch_revision integer CHECK(watch_revision>0),ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(evidence)='array'),
 ADD CONSTRAINT post_event_links_owner_fk FOREIGN KEY(owner_user_id,data_origin) REFERENCES users(id,data_origin),
 ADD CONSTRAINT post_event_links_watch_fk FOREIGN KEY(watch_id,data_origin,owner_user_id,event_id) REFERENCES event_watches(id,data_origin,owner_user_id,event_id),
 ADD CONSTRAINT post_event_links_watch_shape CHECK((watch_id IS NULL AND watch_revision IS NULL) OR (watch_id IS NOT NULL AND watch_revision IS NOT NULL AND owner_user_id IS NOT NULL));
ALTER TABLE post_event_links DROP CONSTRAINT post_event_links_data_origin_post_id_event_id_method_key;
ALTER TABLE post_event_links ADD CONSTRAINT post_event_links_scope_key UNIQUE NULLS NOT DISTINCT(data_origin,owner_user_id,post_id,event_id,method);
ALTER TABLE event_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_watches FORCE ROW LEVEL SECURITY;
CREATE POLICY event_watches_owner ON event_watches USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE event_watch_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_watch_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY event_watch_rules_owner ON event_watch_rules USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE event_coverage_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_coverage_windows FORCE ROW LEVEL SECURITY;
CREATE POLICY event_coverage_windows_owner ON event_coverage_windows USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE post_event_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_event_links FORCE ROW LEVEL SECURITY;
CREATE POLICY post_event_links_read ON post_event_links FOR SELECT USING((owner_user_id IS NULL OR owner_user_id::text=current_setting('memeradar.user_id',true)) AND data_origin::text=current_setting('memeradar.data_origin',true));
CREATE POLICY post_event_links_write ON post_event_links FOR ALL USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_rules_owner ON alert_rules USING(user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
COMMIT;
