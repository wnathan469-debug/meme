-- Additive V2 migration. SQL is authoritative; run through the checksum-aware runner.
BEGIN;
SET LOCAL search_path=memeradar,public;
CREATE TABLE provider_status (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
provider text NOT NULL, namespace text NOT NULL DEFAULT 'default', status text NOT NULL CHECK(status IN ('connected','degraded','error','disabled','untested')),
 last_success_at timestamptz, last_error_at timestamptz, last_error_code text CHECK(last_error_code IS NULL OR last_error_code ~ '^[A-Z_]+$'),
 capabilities jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(capabilities)='object'),
 quota_limit raw_quantity, quota_remaining raw_quantity, quota_reset_at timestamptz, UNIQUE(data_origin,provider,namespace),
 UNIQUE(id,data_origin)
);
CREATE INDEX provider_status_origin_idx ON provider_status(data_origin);
CREATE TRIGGER provider_status_updated BEFORE UPDATE ON provider_status FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE provider_budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
provider text NOT NULL, namespace text NOT NULL, budget_key text NOT NULL,
 limit_micros raw_quantity NOT NULL, spent_micros raw_quantity NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL, CHECK(spent_micros<=limit_micros), UNIQUE(data_origin,provider,namespace,budget_key),
 UNIQUE(id,data_origin)
);
CREATE INDEX provider_budgets_origin_idx ON provider_budgets(data_origin);
CREATE TRIGGER provider_budgets_updated BEFORE UPDATE ON provider_budgets FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_cost_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
namespace text NOT NULL, request_id uuid NOT NULL, endpoint text CHECK(endpoint IN ('recent','archive','posts','username','users','timeline','conversation','quotes','stream')), feature text CHECK(feature IN ('watch','people','conversations')), reserved_micros raw_quantity NOT NULL,
 settled_micros raw_quantity, expires_at timestamptz NOT NULL,
 CHECK(settled_micros<=reserved_micros), UNIQUE(data_origin,namespace,request_id),
 UNIQUE(id,data_origin)
);
CREATE INDEX x_cost_reservations_origin_idx ON x_cost_reservations(data_origin);
CREATE TRIGGER x_cost_reservations_updated BEFORE UPDATE ON x_cost_reservations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_reservation_budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
reservation_id uuid NOT NULL, budget_id uuid NOT NULL,
 UNIQUE(data_origin,reservation_id,budget_id), FOREIGN KEY(reservation_id,data_origin) REFERENCES x_cost_reservations(id,data_origin) ON DELETE RESTRICT, FOREIGN KEY(budget_id,data_origin) REFERENCES provider_budgets(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX x_reservation_budgets_origin_idx ON x_reservation_budgets(data_origin);
CREATE TRIGGER x_reservation_budgets_updated BEFORE UPDATE ON x_reservation_budgets FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE x_usage_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
namespace text NOT NULL, request_id uuid NOT NULL, endpoint text NOT NULL CHECK(endpoint IN ('recent','archive','posts','username','users','timeline','conversation','quotes','stream')),
 feature text NOT NULL CHECK(feature IN ('watch','people','conversations')), status_code integer CHECK(status_code BETWEEN 100 AND 599),
 posts raw_quantity, users_count raw_quantity, cost_micros raw_quantity NOT NULL,
 estimated boolean NOT NULL, observed_at timestamptz NOT NULL,
 UNIQUE(data_origin,namespace,request_id), FOREIGN KEY(data_origin,namespace,request_id) REFERENCES x_cost_reservations(data_origin,namespace,request_id),
 UNIQUE(id,data_origin)
);
CREATE INDEX x_usage_ledger_origin_idx ON x_usage_ledger(data_origin);
CREATE TRIGGER x_usage_ledger_updated BEFORE UPDATE ON x_usage_ledger FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE alert_rules DROP CONSTRAINT alert_rules_type_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_type_check CHECK(type IN ('news','token_link','attention_acceleration','liquidity_change','wallet_movement','risk_signal','source_degradation','x_keyword','tracked_person_post','conversation_activity','provider_budget','provider_disconnect')),
 ADD COLUMN delivery_mode text NOT NULL DEFAULT 'immediate' CHECK(delivery_mode IN ('immediate','digest')),
 ADD COLUMN digest_interval_seconds integer CHECK(digest_interval_seconds BETWEEN 60 AND 604800),
 ADD COLUMN max_per_hour integer CHECK(max_per_hour BETWEEN 1 AND 10000),
 ADD CONSTRAINT alert_rules_digest_valid CHECK((delivery_mode='digest')=(digest_interval_seconds IS NOT NULL));
ALTER TABLE alerts ADD COLUMN delivery_mode text NOT NULL DEFAULT 'immediate' CHECK(delivery_mode IN ('immediate','digest')),
 ADD COLUMN digest_interval_seconds integer CHECK(digest_interval_seconds BETWEEN 60 AND 604800),
 ADD COLUMN max_per_hour integer CHECK(max_per_hour BETWEEN 1 AND 10000),
 ADD CONSTRAINT alerts_digest_valid CHECK((delivery_mode='digest')=(digest_interval_seconds IS NOT NULL));
CREATE INDEX x_usage_ledger_time_idx ON x_usage_ledger(data_origin,namespace,observed_at);
CREATE INDEX x_reservation_budgets_budget_idx ON x_reservation_budgets(data_origin,budget_id);

ALTER TABLE x_usage_ledger ALTER COLUMN knowledge_kind SET DEFAULT 'CALCULATED';
ALTER TABLE x_cost_reservations ALTER COLUMN knowledge_kind SET DEFAULT 'CALCULATED';
CREATE FUNCTION validate_x_usage_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path=memeradar,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM x_cost_reservations WHERE request_id=NEW.request_id AND namespace=NEW.namespace AND data_origin=NEW.data_origin AND settled_micros=NEW.cost_micros AND (endpoint IS NULL OR endpoint=NEW.endpoint) AND (feature IS NULL OR feature=NEW.feature)) THEN
 RAISE EXCEPTION 'Usage requires matching settled reservation' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER x_usage_settlement BEFORE INSERT OR UPDATE ON x_usage_ledger FOR EACH ROW EXECUTE FUNCTION validate_x_usage_settlement();
CREATE FUNCTION protect_x_reservation() RETURNS trigger LANGUAGE plpgsql SET search_path=memeradar,pg_temp AS $$
BEGIN
 IF (NEW.namespace,NEW.request_id,NEW.reserved_micros,NEW.endpoint,NEW.feature) IS DISTINCT FROM (OLD.namespace,OLD.request_id,OLD.reserved_micros,OLD.endpoint,OLD.feature)
 OR (OLD.settled_micros IS NOT NULL AND NEW.settled_micros IS DISTINCT FROM OLD.settled_micros) THEN
 RAISE EXCEPTION 'Reservation identity and settled cost are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER x_cost_reservations_immutable BEFORE UPDATE ON x_cost_reservations FOR EACH ROW EXECUTE FUNCTION protect_x_reservation();
COMMIT;
