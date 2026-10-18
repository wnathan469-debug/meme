-- Conservative rollback: never discard V2 rows implicitly.
BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
LOCK TABLE x_usage_ledger,x_reservation_budgets,x_cost_reservations,provider_budgets,provider_status,alerts,alert_rules IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM provider_status) THEN RAISE EXCEPTION 'Rollback refused: provider_status contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM provider_budgets) THEN RAISE EXCEPTION 'Rollback refused: provider_budgets contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_cost_reservations) THEN RAISE EXCEPTION 'Rollback refused: x_cost_reservations contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_reservation_budgets) THEN RAISE EXCEPTION 'Rollback refused: x_reservation_budgets contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM x_usage_ledger) THEN RAISE EXCEPTION 'Rollback refused: x_usage_ledger contains V2 data'; END IF;
 IF EXISTS(SELECT 1 FROM alert_rules WHERE type NOT IN ('news','token_link','attention_acceleration','liquidity_change','wallet_movement','risk_signal','source_degradation') OR delivery_mode<>'immediate' OR digest_interval_seconds IS NOT NULL OR max_per_hour IS NOT NULL)
 OR EXISTS(SELECT 1 FROM alerts WHERE delivery_mode<>'immediate' OR digest_interval_seconds IS NOT NULL OR max_per_hour IS NOT NULL) THEN RAISE EXCEPTION 'Rollback refused: V2 alert configuration in use'; END IF;
END $$;
ALTER TABLE alerts DROP COLUMN delivery_mode, DROP COLUMN digest_interval_seconds, DROP COLUMN max_per_hour;
ALTER TABLE alert_rules DROP COLUMN delivery_mode, DROP COLUMN digest_interval_seconds, DROP COLUMN max_per_hour, DROP CONSTRAINT alert_rules_type_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_type_check CHECK(type IN ('news','token_link','attention_acceleration','liquidity_change','wallet_movement','risk_signal','source_degradation'));

DROP TABLE x_usage_ledger;
DROP FUNCTION validate_x_usage_settlement();
DROP TABLE x_reservation_budgets;
DROP TABLE x_cost_reservations;
DROP FUNCTION protect_x_reservation();
DROP TABLE provider_budgets;
DROP TABLE provider_status;
COMMIT;
