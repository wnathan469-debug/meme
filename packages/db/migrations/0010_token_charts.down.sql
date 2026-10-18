BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
LOCK TABLE chart_cache_windows,pool_market_samples,pool_trades,market_request_controls,pools,price_candles IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM chart_cache_windows) OR EXISTS(SELECT 1 FROM pool_market_samples) OR EXISTS(SELECT 1 FROM pool_trades) OR EXISTS(SELECT 1 FROM market_request_controls) OR EXISTS(SELECT 1 FROM pools WHERE market_provider<>'legacy' OR price_token_side<>'base') OR EXISTS(SELECT 1 FROM price_candles WHERE source_url IS NOT NULL) THEN RAISE EXCEPTION 'Rollback refused: market history/cache is in use'; END IF;
END $$;
DROP TABLE chart_cache_windows,pool_market_samples,pool_trades,market_request_controls;
ALTER TABLE price_candles DROP COLUMN source_url;
ALTER TABLE pools DROP COLUMN price_token_side,DROP COLUMN market_provider;
COMMIT;
