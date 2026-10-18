-- Additive V2 migration. SQL is authoritative; run through the checksum-aware runner.
BEGIN;
SET LOCAL search_path=memeradar,public;
CREATE TABLE post_token_mentions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
post_id uuid NOT NULL, token_id uuid NOT NULL,
 detection_method text NOT NULL CHECK(detection_method IN ('exact_address','cashtag','name','token_page_url')),
 confidence fraction NOT NULL, notes text, UNIQUE(data_origin,post_id,token_id,detection_method),
 FOREIGN KEY(post_id,data_origin) REFERENCES x_posts(id,data_origin) ON DELETE RESTRICT, FOREIGN KEY(token_id,data_origin) REFERENCES tokens(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX post_token_mentions_origin_idx ON post_token_mentions(data_origin);
CREATE TRIGGER post_token_mentions_updated BEFORE UPDATE ON post_token_mentions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE post_event_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
post_id uuid NOT NULL, event_id uuid NOT NULL, score fraction NOT NULL, method text NOT NULL,
 UNIQUE(data_origin,post_id,event_id,method), FOREIGN KEY(post_id,data_origin) REFERENCES x_posts(id,data_origin) ON DELETE RESTRICT, FOREIGN KEY(event_id,data_origin) REFERENCES events(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX post_event_links_origin_idx ON post_event_links(data_origin);
CREATE TRIGGER post_event_links_updated BEFORE UPDATE ON post_event_links FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE token_chart_markers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
token_id uuid NOT NULL, marker_type text NOT NULL CHECK(marker_type IN ('event','x_post','liquidity_change','pool_created','alert')),
 occurred_at timestamptz NOT NULL, event_id uuid, post_id uuid, pool_id uuid, alert_id uuid,
 label text NOT NULL,
 CHECK((marker_type='event' AND event_id IS NOT NULL AND num_nonnulls(event_id,post_id,pool_id,alert_id)=1)
 OR (marker_type='x_post' AND post_id IS NOT NULL AND num_nonnulls(event_id,post_id,pool_id,alert_id)=1)
 OR (marker_type IN ('liquidity_change','pool_created') AND pool_id IS NOT NULL AND num_nonnulls(event_id,post_id,pool_id,alert_id)=1)
 OR (marker_type='alert' AND alert_id IS NOT NULL AND num_nonnulls(event_id,post_id,pool_id,alert_id)=1)),
 FOREIGN KEY(token_id,data_origin) REFERENCES tokens(id,data_origin) ON DELETE RESTRICT, FOREIGN KEY(event_id,data_origin) REFERENCES events(id,data_origin) ON DELETE RESTRICT, FOREIGN KEY(post_id,data_origin) REFERENCES x_posts(id,data_origin) ON DELETE RESTRICT, FOREIGN KEY(pool_id,data_origin) REFERENCES pools(id,data_origin) ON DELETE RESTRICT, FOREIGN KEY(alert_id,data_origin) REFERENCES alerts(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX token_chart_markers_origin_idx ON token_chart_markers(data_origin);
CREATE TRIGGER token_chart_markers_updated BEFORE UPDATE ON token_chart_markers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE price_candles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 data_origin data_origin NOT NULL,
 knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
token_id uuid NOT NULL, pool_address text NOT NULL, interval text NOT NULL CHECK(interval IN ('1m','5m','15m','1h','4h','1d')),
 bucket_start timestamptz NOT NULL, open exact_nonnegative NOT NULL, high exact_nonnegative NOT NULL,
 low exact_nonnegative NOT NULL, close exact_nonnegative NOT NULL, volume exact_nonnegative, provider text NOT NULL,
 fetched_at timestamptz NOT NULL, CHECK(high>=greatest(open,low,close) AND low<=least(open,close)),
 UNIQUE(data_origin,token_id,pool_address,interval,bucket_start,provider), FOREIGN KEY(token_id,data_origin) REFERENCES tokens(id,data_origin) ON DELETE RESTRICT,
 UNIQUE(id,data_origin)
);
CREATE INDEX price_candles_origin_idx ON price_candles(data_origin);
CREATE TRIGGER price_candles_updated BEFORE UPDATE ON price_candles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE tokens ADD COLUMN first_social_seen_at timestamptz, ADD COLUMN first_social_post_id uuid,
 ADD CONSTRAINT tokens_first_social_post_fk FOREIGN KEY(first_social_post_id,data_origin) REFERENCES x_posts(id,data_origin),
 ADD CONSTRAINT tokens_first_social_pair CHECK((first_social_seen_at IS NULL)=(first_social_post_id IS NULL));
CREATE INDEX tokens_first_social_idx ON tokens(data_origin,first_social_post_id);
CREATE INDEX price_candles_history_idx ON price_candles(data_origin,token_id,interval,bucket_start);
CREATE INDEX token_chart_markers_time_idx ON token_chart_markers(data_origin,token_id,occurred_at);

ALTER TABLE pools ADD CONSTRAINT pools_id_origin_token_unique UNIQUE(id,data_origin,token_id);
ALTER TABLE token_chart_markers ADD CONSTRAINT token_chart_marker_pool_matches_token FOREIGN KEY(pool_id,data_origin,token_id) REFERENCES pools(id,data_origin,token_id);
ALTER TABLE price_candles ADD CONSTRAINT price_candles_known_pool FOREIGN KEY(data_origin,token_id,pool_address) REFERENCES pools(data_origin,token_id,pool_address);
COMMIT;
