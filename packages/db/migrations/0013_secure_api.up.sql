BEGIN;
SET LOCAL search_path=memeradar,public;
CREATE TABLE server_collection_controls (
 data_origin data_origin PRIMARY KEY, knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 stopped boolean NOT NULL DEFAULT true
);
CREATE TABLE server_provider_policies (
 data_origin data_origin NOT NULL, provider text NOT NULL CHECK(provider IN ('x','gecko','goplus')),
 namespace text NOT NULL CHECK(namespace ~ '^[a-zA-Z0-9_-]{1,80}$'),
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 enabled boolean NOT NULL DEFAULT false, verified_at timestamptz, paid_consent_at timestamptz,
 request_ceiling_micros raw_quantity NOT NULL, daily_limit_micros raw_quantity NOT NULL, monthly_limit_micros raw_quantity NOT NULL,
 max_requests_day integer NOT NULL CHECK(max_requests_day BETWEEN 1 AND 1000000),
 CHECK(daily_limit_micros<=monthly_limit_micros),
 CHECK(request_ceiling_micros=0 OR paid_consent_at IS NOT NULL),
 PRIMARY KEY(data_origin,provider,namespace)
);
CREATE TABLE server_provider_usage (
 data_origin data_origin NOT NULL, provider text NOT NULL, namespace text NOT NULL,
 period text NOT NULL CHECK(period ~ '^(day:[0-9]{4}-[0-9]{2}-[0-9]{2}|month:[0-9]{4}-[0-9]{2})$'),
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 reserved_micros raw_quantity NOT NULL DEFAULT 0, requests bigint NOT NULL DEFAULT 0 CHECK(requests>=0),
 PRIMARY KEY(data_origin,provider,namespace,period),
 FOREIGN KEY(data_origin,provider,namespace) REFERENCES server_provider_policies(data_origin,provider,namespace) ON DELETE RESTRICT
);
CREATE TABLE server_request_limits (
 data_origin data_origin NOT NULL, key_hash text NOT NULL CHECK(key_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 requests integer NOT NULL CHECK(requests>0),
 PRIMARY KEY(data_origin,key_hash,window_start)
);
CREATE INDEX server_provider_policies_origin_idx ON server_provider_policies(data_origin);
CREATE INDEX server_provider_usage_origin_idx ON server_provider_usage(data_origin);
CREATE INDEX server_request_limits_origin_idx ON server_request_limits(data_origin);
CREATE INDEX server_request_limits_expiry_idx ON server_request_limits(window_start);
DO $body$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['server_collection_controls','server_provider_policies','server_provider_usage','server_request_limits'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY server_origin ON %I USING(data_origin::text=current_setting(''memeradar.data_origin'',true)) WITH CHECK(data_origin::text=current_setting(''memeradar.data_origin'',true))',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',t||'_updated',t);
 END LOOP;
END $body$;
COMMENT ON TABLE server_provider_usage IS 'Conservative reservations, not a supplier invoice; ambiguous calls and upper bounds are never silently refunded.';
COMMIT;
