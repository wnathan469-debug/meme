BEGIN;
SET LOCAL search_path=memeradar,public;
ALTER TABLE pools ADD COLUMN price_token_side text NOT NULL DEFAULT 'base' CHECK(price_token_side IN ('base','quote')),ADD COLUMN market_provider text NOT NULL DEFAULT 'legacy';
ALTER TABLE price_candles ADD COLUMN source_url http_url;
CREATE TABLE chart_cache_windows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data_origin data_origin NOT NULL,knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 token_id uuid NOT NULL,pool_address text NOT NULL,interval text NOT NULL CHECK(interval IN ('1m','5m','15m','1h','4h','1d')),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),provider text NOT NULL,
 trades_status text NOT NULL DEFAULT 'not_requested' CHECK(trades_status IN ('not_requested','available','partial','error')),trades_error_code text CHECK(trades_error_code IS NULL OR trades_error_code ~ '^[A-Z_]+$'),
 fetched_at timestamptz,status text NOT NULL CHECK(status IN ('pending','available','partial','empty','error')),error_code text CHECK(error_code IS NULL OR error_code ~ '^[A-Z_]+$'),source_url http_url,
 lease_id uuid,lease_expires_at timestamptz,CHECK((lease_id IS NULL)=(lease_expires_at IS NULL)),
 UNIQUE(data_origin,token_id,pool_address,interval,starts_at,ends_at,provider),UNIQUE(id,data_origin),
 FOREIGN KEY(data_origin,token_id,pool_address) REFERENCES pools(data_origin,token_id,pool_address)
);
CREATE TABLE pool_market_samples (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data_origin data_origin NOT NULL,knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 token_id uuid NOT NULL,pool_address text NOT NULL,metric text NOT NULL CHECK(metric IN ('liquidity_usd','market_cap_estimated')),observed_at timestamptz NOT NULL,value exact_nonnegative,missing_reason text,provider text NOT NULL,fetched_at timestamptz NOT NULL,source_url http_url NOT NULL,
 CHECK((value IS NULL)=(missing_reason IS NOT NULL)),UNIQUE(data_origin,token_id,pool_address,metric,observed_at,provider),UNIQUE(id,data_origin),
 FOREIGN KEY(data_origin,token_id,pool_address) REFERENCES pools(data_origin,token_id,pool_address)
);
CREATE TABLE pool_trades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data_origin data_origin NOT NULL,knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 token_id uuid NOT NULL,pool_address text NOT NULL,external_id text NOT NULL,occurred_at timestamptz NOT NULL,side text NOT NULL CHECK(side IN ('buy','sell')),usd exact_nonnegative,token_amount exact_nonnegative,wallet_address text,provider text NOT NULL,fetched_at timestamptz NOT NULL,source_url http_url NOT NULL,
 UNIQUE(data_origin,token_id,pool_address,external_id,provider),UNIQUE(id,data_origin),FOREIGN KEY(data_origin,token_id,pool_address) REFERENCES pools(data_origin,token_id,pool_address)
);
CREATE TABLE market_request_controls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data_origin data_origin NOT NULL,knowledge_kind knowledge_kind NOT NULL DEFAULT 'CALCULATED',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 provider text NOT NULL,window_start timestamptz NOT NULL,requests integer NOT NULL CHECK(requests BETWEEN 0 AND 20),blocked_until timestamptz,UNIQUE(data_origin,provider),UNIQUE(id,data_origin)
);
CREATE INDEX chart_cache_windows_origin_idx ON chart_cache_windows(data_origin,token_id,pool_address,interval,fetched_at DESC);
CREATE INDEX pool_market_samples_origin_idx ON pool_market_samples(data_origin,token_id,pool_address,metric,observed_at);
CREATE INDEX pool_trades_origin_idx ON pool_trades(data_origin,token_id,pool_address,occurred_at);
CREATE INDEX market_request_controls_origin_idx ON market_request_controls(data_origin,provider);
CREATE TRIGGER chart_cache_windows_updated BEFORE UPDATE ON chart_cache_windows FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER pool_market_samples_updated BEFORE UPDATE ON pool_market_samples FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER pool_trades_updated BEFORE UPDATE ON pool_trades FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER market_request_controls_updated BEFORE UPDATE ON market_request_controls FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
COMMIT;
