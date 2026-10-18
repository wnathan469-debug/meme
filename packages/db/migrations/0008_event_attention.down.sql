BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
LOCK TABLE event_watches,event_watch_rules,event_coverage_windows,post_event_links,alert_rules IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM event_watches) OR EXISTS(SELECT 1 FROM event_watch_rules) OR EXISTS(SELECT 1 FROM event_coverage_windows)
 OR EXISTS(SELECT 1 FROM post_event_links WHERE owner_user_id IS NOT NULL OR watch_id IS NOT NULL OR watch_revision IS NOT NULL OR evidence<>'[]')
 OR EXISTS(SELECT 1 FROM alert_rules WHERE conditions->>'created_by'='event-phase6') THEN RAISE EXCEPTION 'Rollback refused: private event data is in use'; END IF;
END $$;
DROP POLICY alert_rules_owner ON alert_rules;
ALTER TABLE alert_rules NO FORCE ROW LEVEL SECURITY;
ALTER TABLE alert_rules DISABLE ROW LEVEL SECURITY;
DROP POLICY post_event_links_read ON post_event_links;
DROP POLICY post_event_links_write ON post_event_links;
ALTER TABLE post_event_links NO FORCE ROW LEVEL SECURITY;
ALTER TABLE post_event_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE post_event_links DROP CONSTRAINT post_event_links_scope_key,DROP CONSTRAINT post_event_links_owner_fk,DROP CONSTRAINT post_event_links_watch_fk,DROP CONSTRAINT post_event_links_watch_shape,
 DROP COLUMN owner_user_id,DROP COLUMN watch_id,DROP COLUMN watch_revision,DROP COLUMN evidence;
ALTER TABLE post_event_links ADD CONSTRAINT post_event_links_data_origin_post_id_event_id_method_key UNIQUE(data_origin,post_id,event_id,method);
DROP TABLE event_coverage_windows,event_watch_rules,event_watches;
COMMIT;
