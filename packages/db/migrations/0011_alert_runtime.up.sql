BEGIN;
SET LOCAL search_path=memeradar,public;
ALTER TABLE alert_rules DROP CONSTRAINT alert_rules_type_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_type_check CHECK(type IN ('news','token_link','attention_acceleration','liquidity_change','wallet_movement','risk_signal','source_degradation','x_keyword','tracked_person_post','conversation_activity','provider_budget','provider_disconnect','transaction_activity')),
 ADD CONSTRAINT alert_rules_owner_key UNIQUE(id,data_origin,user_id);
CREATE TABLE alert_runtime_states (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'CALCULATED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 rule_id uuid NOT NULL, user_id uuid NOT NULL,
 state jsonb NOT NULL CHECK(jsonb_typeof(state)='object' AND octet_length(state::text)<=2000000),
 UNIQUE(rule_id,data_origin), UNIQUE(id,data_origin),
 FOREIGN KEY(rule_id,data_origin,user_id) REFERENCES alert_rules(id,data_origin,user_id) ON DELETE RESTRICT
);
CREATE INDEX alert_runtime_states_origin_idx ON alert_runtime_states(data_origin);
CREATE TRIGGER alert_runtime_states_updated BEFORE UPDATE ON alert_runtime_states FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
ALTER TABLE alert_runtime_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_runtime_states FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_runtime_owner ON alert_runtime_states USING(user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(user_id::text=current_setting('memeradar.user_id',true) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY alerts_owner ON alerts USING(EXISTS(SELECT 1 FROM alert_rules r WHERE r.id=rule_id AND r.data_origin=alerts.data_origin AND r.user_id::text=current_setting('memeradar.user_id',true)) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(EXISTS(SELECT 1 FROM alert_rules r WHERE r.id=rule_id AND r.data_origin=alerts.data_origin AND r.user_id::text=current_setting('memeradar.user_id',true)) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE alert_subject_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_subject_states FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_subject_owner ON alert_subject_states USING(EXISTS(SELECT 1 FROM alert_rules r WHERE r.id=rule_id AND r.data_origin=alert_subject_states.data_origin AND r.user_id::text=current_setting('memeradar.user_id',true)) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(EXISTS(SELECT 1 FROM alert_rules r WHERE r.id=rule_id AND r.data_origin=alert_subject_states.data_origin AND r.user_id::text=current_setting('memeradar.user_id',true)) AND data_origin::text=current_setting('memeradar.data_origin',true));
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_owner ON notification_deliveries USING(EXISTS(SELECT 1 FROM alerts a JOIN alert_rules r ON r.id=a.rule_id AND r.data_origin=a.data_origin WHERE a.id=alert_id AND a.data_origin=notification_deliveries.data_origin AND r.user_id::text=current_setting('memeradar.user_id',true)) AND data_origin::text=current_setting('memeradar.data_origin',true)) WITH CHECK(EXISTS(SELECT 1 FROM alerts a JOIN alert_rules r ON r.id=a.rule_id AND r.data_origin=a.data_origin WHERE a.id=alert_id AND a.data_origin=notification_deliveries.data_origin AND r.user_id::text=current_setting('memeradar.user_id',true)) AND data_origin::text=current_setting('memeradar.data_origin',true));
COMMIT;
