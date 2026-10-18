BEGIN;
SET LOCAL search_path=memeradar,public;
CREATE TABLE provider_controls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 provider text NOT NULL CHECK(provider IN ('x','gecko','goplus')),
 namespace text NOT NULL CHECK(namespace ~ '^[a-zA-Z0-9_-]{1,80}$'), owner_user_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false, settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object' AND octet_length(settings::text)<=65536),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), failures integer NOT NULL DEFAULT 0 CHECK(failures BETWEEN 0 AND 10000), blocked_until timestamptz, circuit_lease_until timestamptz,
 probe_id uuid, probe_ceiling raw_quantity, probe_expires_at timestamptz,
 UNIQUE(id,data_origin), UNIQUE(data_origin,provider,namespace), UNIQUE(data_origin,provider,owner_user_id),
 FOREIGN KEY(owner_user_id,data_origin) REFERENCES users(id,data_origin),
 CHECK(enabled=(settings->>'enabled')::boolean)
);
CREATE INDEX provider_controls_origin_idx ON provider_controls(data_origin);
CREATE TRIGGER provider_controls_updated BEFORE UPDATE ON provider_controls FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE provider_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_controls FORCE ROW LEVEL SECURITY;
-- Non-secret enforcement policy is readable by the trusted coordinator without a user session.
CREATE POLICY provider_controls_read ON provider_controls FOR SELECT USING(true);
CREATE POLICY provider_controls_insert ON provider_controls FOR INSERT WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
CREATE POLICY provider_controls_owner ON provider_controls FOR UPDATE USING(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(owner_user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
CREATE TABLE provider_diagnostics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 provider text NOT NULL, namespace text NOT NULL, event_key uuid NOT NULL, observed_at timestamptz NOT NULL,
 diagnostic jsonb NOT NULL CHECK(jsonb_typeof(diagnostic)='object' AND octet_length(diagnostic::text)<=8192 AND diagnostic - ARRAY['id','endpoint','at','code','status','quota','retryAt']='{}'::jsonb),
 UNIQUE(id,data_origin), UNIQUE(data_origin,provider,namespace,event_key),
 FOREIGN KEY(data_origin,provider,namespace) REFERENCES provider_controls(data_origin,provider,namespace) ON DELETE RESTRICT
);
CREATE INDEX provider_diagnostics_origin_idx ON provider_diagnostics(data_origin);
CREATE INDEX provider_diagnostics_recent_idx ON provider_diagnostics(data_origin,provider,namespace,observed_at DESC);
CREATE TRIGGER provider_diagnostics_updated BEFORE UPDATE ON provider_diagnostics FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE provider_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_diagnostics FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_diagnostics_owner ON provider_diagnostics FOR SELECT USING(EXISTS(SELECT 1 FROM provider_controls p WHERE p.provider=provider_diagnostics.provider AND p.namespace=provider_diagnostics.namespace AND p.data_origin=provider_diagnostics.data_origin AND p.owner_user_id::text=current_setting('memeradar.user_id',true)) AND data_origin::text=current_setting('memeradar.data_origin',true));
-- Only sanitised technical writers use this insert path; no raw request/error-body column exists.
CREATE POLICY provider_diagnostics_service ON provider_diagnostics FOR INSERT WITH CHECK(true);
COMMIT;
