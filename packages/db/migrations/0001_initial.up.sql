-- MemeRadar / PostgreSQL 16. All application rows have an explicit origin.
BEGIN;
SELECT pg_advisory_xact_lock(716202603);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA memeradar;
SET LOCAL search_path = memeradar, public;
CREATE TYPE data_origin AS ENUM ('REAL', 'DEMO');
CREATE TYPE knowledge_kind AS ENUM ('OBSERVED', 'CALCULATED', 'INTERPRETED');
CREATE TYPE confidence_level AS ENUM ('CONFIRMED', 'PLAUSIBLE', 'WEAK', 'INSUFFICIENT_DATA');
CREATE TYPE risk_status AS ENUM ('signal_detected', 'no_signal_detected', 'check_failed', 'not_applicable', 'insufficient_data');
CREATE TYPE indicator_kind AS ENUM ('ATTENTION', 'EVENT_LINK', 'DATA_QUALITY', 'ONCHAIN_RISK', 'ANALYSIS_CONFIDENCE');
CREATE DOMAIN exact_nonnegative AS numeric CHECK (VALUE >= 0 AND VALUE::text NOT IN ('NaN','Infinity','-Infinity'));
CREATE DOMAIN fraction AS numeric CHECK (VALUE BETWEEN 0 AND 1 AND VALUE::text <> 'NaN');
CREATE DOMAIN percentage AS numeric CHECK (VALUE BETWEEN 0 AND 100 AND VALUE::text <> 'NaN');
CREATE DOMAIN raw_quantity AS numeric CHECK (VALUE >= 0 AND VALUE = trunc(VALUE) AND VALUE::text NOT IN ('NaN','Infinity','-Infinity'));
CREATE DOMAIN http_url AS text CHECK (VALUE ~ '^https?://[^[:space:]]+$');
CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
COMMENT ON TABLE schema_migrations IS 'Technical migration ledger; not application data and has no origin.';
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
 password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
 role text NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
 timezone text NOT NULL DEFAULT 'America/Toronto', disabled boolean NOT NULL DEFAULT false,
 UNIQUE (data_origin, email),
  UNIQUE (id, data_origin)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL, token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 csrf_hash text NOT NULL CHECK (csrf_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, UNIQUE(data_origin, token_hash), CHECK (expires_at > created_at),
  UNIQUE (id, data_origin),
  FOREIGN KEY (user_id, data_origin) REFERENCES users(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('rss','api_news','official_press','social_x','social_reddit','social_youtube','social_telegram_public','custom')),
 name text NOT NULL, base_url http_url NOT NULL,
 reliability_tier text NOT NULL CHECK (reliability_tier IN ('A','B','C','D','E')),
 reliability_notes text NOT NULL, tos_url http_url, tos_reviewed_at timestamptz,
 rate_limit_policy jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(rate_limit_policy)='object'),
 enabled boolean NOT NULL DEFAULT false,
 CHECK (data_origin <> 'DEMO' OR base_url ~ '^https://demo[.]memeradar[.]invalid(/|$)'),
  UNIQUE (id, data_origin),
  CHECK (data_origin <> 'DEMO' OR base_url ~ '^https://demo[.]memeradar[.]invalid(/|$)'),
  CHECK (data_origin <> 'DEMO' OR tos_url ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);

CREATE TABLE source_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_id uuid NOT NULL, cursor jsonb NOT NULL DEFAULT '{}', etag text, last_modified text,
 last_success_at timestamptz, next_fetch_at timestamptz, last_error_code text,
 UNIQUE(data_origin,source_id),
  UNIQUE (id, data_origin),
  FOREIGN KEY (source_id, data_origin) REFERENCES sources(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE raw_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_id uuid NOT NULL, external_id text NOT NULL, url http_url NOT NULL, canonical_url http_url NOT NULL,
 title text NOT NULL, body_excerpt text CHECK (length(body_excerpt)<=4000), author_handle text, language text,
 published_at timestamptz NOT NULL, fetched_at timestamptz NOT NULL,
 UNIQUE(id,data_origin,source_id),
 content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'), simhash bit(64),
 raw_payload_ref text, payload_expires_at timestamptz, excerpt_expires_at timestamptz, purged_at timestamptz,
 UNIQUE(data_origin,source_id,external_id),
 CHECK (data_origin <> 'DEMO' OR (url ~ '^https://demo[.]memeradar[.]invalid(/|$)' AND canonical_url ~ '^https://demo[.]memeradar[.]invalid(/|$)')),
  UNIQUE (id, data_origin),
  FOREIGN KEY (source_id, data_origin) REFERENCES sources(id, data_origin) ON DELETE RESTRICT,
  CHECK (data_origin <> 'DEMO' OR url ~ '^https://demo[.]memeradar[.]invalid(/|$)'),
  CHECK (data_origin <> 'DEMO' OR canonical_url ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);

CREATE TABLE entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('person','company','product','project','keyword','hashtag','ticker_mention')),
 canonical_name text NOT NULL, aliases text[] NOT NULL DEFAULT '{}', official_handles jsonb NOT NULL DEFAULT '{}',
 official_domains text[] NOT NULL DEFAULT '{}', UNIQUE(data_origin,type,canonical_name),
  UNIQUE (id, data_origin)
);

CREATE TABLE raw_item_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'INTERPRETED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  raw_item_id uuid NOT NULL, entity_id uuid NOT NULL, confidence fraction NOT NULL,
 extraction_method text NOT NULL CHECK (extraction_method IN ('dictionary','regex','NER','LLM')),
 UNIQUE(data_origin,raw_item_id,entity_id),
  UNIQUE (id, data_origin),
  FOREIGN KEY (raw_item_id, data_origin) REFERENCES raw_items(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (entity_id, data_origin) REFERENCES entities(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'CALCULATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL, summary text NOT NULL,
 summary_method text NOT NULL CHECK (summary_method IN ('extractive','LLM','manual')),
 first_published_at timestamptz NOT NULL, first_detected_at timestamptz NOT NULL,
 detection_latency_seconds numeric GENERATED ALWAYS AS (extract(epoch FROM (first_detected_at-first_published_at))) STORED,
 status text NOT NULL CHECK (status IN ('emerging','active','fading','closed')),
 source_reliability_level text NOT NULL CHECK (source_reliability_level IN ('A','B','C','D','E','INSUFFICIENT_DATA')),
 popularity_level text NOT NULL CHECK (popularity_level IN ('VERY_LOW','LOW','MODERATE','HIGH','VERY_HIGH','INSUFFICIENT_DATA')),
  UNIQUE (id, data_origin)
);

CREATE TABLE event_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'CALCULATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid NOT NULL, raw_item_id uuid NOT NULL, similarity_score fraction NOT NULL,
 is_origin_candidate boolean NOT NULL DEFAULT false, UNIQUE(data_origin,event_id,raw_item_id),
  UNIQUE (id, data_origin),
  FOREIGN KEY (event_id, data_origin) REFERENCES events(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (raw_item_id, data_origin) REFERENCES raw_items(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE attention_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'CALCULATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid, entity_id uuid, bucket_start timestamptz NOT NULL,
 bucket_size_seconds integer NOT NULL CHECK (bucket_size_seconds IN (300,3600,86400)),
 mention_count integer NOT NULL CHECK (mention_count>=0), unique_accounts integer CHECK (unique_accounts>=0),
 interactions bigint CHECK (interactions>=0), source_breakdown jsonb NOT NULL DEFAULT '{}', data_completeness fraction NOT NULL,
 CHECK (num_nonnulls(event_id,entity_id)=1),
  UNIQUE (id, data_origin),
  FOREIGN KEY (event_id, data_origin) REFERENCES events(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (entity_id, data_origin) REFERENCES entities(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL, name text NOT NULL, UNIQUE(data_origin,user_id,name),
  UNIQUE (id, data_origin),
  FOREIGN KEY (user_id, data_origin) REFERENCES users(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  watchlist_id uuid NOT NULL, expression jsonb NOT NULL CHECK (jsonb_typeof(expression)='object'),
 language text, priority text NOT NULL CHECK (priority IN ('low','normal','high')),
  UNIQUE (id, data_origin),
  FOREIGN KEY (watchlist_id, data_origin) REFERENCES watchlists(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  slug text NOT NULL CHECK (slug IN ('ethereum','base','bsc','arbitrum','solana')),
 family text NOT NULL CHECK (family IN ('evm','svm')), evm_chain_id bigint,
 explorer_url http_url NOT NULL, enabled boolean NOT NULL DEFAULT false,
 CHECK ((family='evm' AND evm_chain_id IS NOT NULL AND evm_chain_id>0) OR (family='svm' AND evm_chain_id IS NULL)),
 CHECK ((slug='solana')=(family='svm')), UNIQUE(data_origin,slug),
 CHECK (data_origin <> 'DEMO' OR explorer_url ~ '^https://demo[.]memeradar[.]invalid(/|$)'),
  UNIQUE (id, data_origin),
  CHECK (data_origin <> 'DEMO' OR explorer_url ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);

CREATE TABLE tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  chain_id uuid NOT NULL, contract_address text NOT NULL,
 address_identity text GENERATED ALWAYS AS (CASE WHEN left(contract_address,2)='0x' THEN lower(contract_address) ELSE contract_address END) STORED,
 name text, symbol text,
 decimals integer CHECK (decimals BETWEEN 0 AND 255), total_supply_raw raw_quantity,
 token_standard text CHECK (token_standard IN ('ERC20','SPL','TOKEN2022')),
 created_at_onchain timestamptz, creation_tx text, creator_address text,
 first_activity_at timestamptz, first_seen_by_app_at timestamptz NOT NULL,
 launchpad text, metadata_uri http_url, UNIQUE(data_origin,chain_id,address_identity),
 UNIQUE(id,data_origin,chain_id,contract_address),
 CHECK ((data_origin='DEMO' AND contract_address ~ '^(0xDEMO[0-9]{36}|DEMo[1-9A-HJ-NP-Za-km-z]{28,40})$') OR
        (data_origin='REAL' AND contract_address !~ '^(0xDEMO|DEMo)' AND contract_address ~ '^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$')),
  UNIQUE (id, data_origin),
  FOREIGN KEY (chain_id, data_origin) REFERENCES chains(id, data_origin) ON DELETE RESTRICT,
  CHECK (data_origin <> 'DEMO' OR metadata_uri ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);

CREATE TABLE official_contract_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  entity_id uuid NOT NULL, token_id uuid NOT NULL, chain_id uuid NOT NULL,
 contract_address text NOT NULL, source_id uuid NOT NULL, raw_item_id uuid NOT NULL,
 published_at timestamptz NOT NULL, evidence_url http_url NOT NULL,
 exact_address_published boolean NOT NULL CHECK (exact_address_published),
 UNIQUE(id,data_origin,token_id),
 FOREIGN KEY(token_id,data_origin,chain_id,contract_address) REFERENCES tokens(id,data_origin,chain_id,contract_address),
 CHECK (data_origin <> 'DEMO' OR evidence_url ~ '^https://demo[.]memeradar[.]invalid(/|$)'),
  UNIQUE (id, data_origin),
  FOREIGN KEY (entity_id, data_origin) REFERENCES entities(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (source_id, data_origin) REFERENCES sources(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (raw_item_id, data_origin) REFERENCES raw_items(id, data_origin) ON DELETE RESTRICT,
  CHECK (data_origin <> 'DEMO' OR evidence_url ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);

CREATE TABLE pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  token_id uuid NOT NULL, dex text NOT NULL, pool_address text NOT NULL, quote_token text NOT NULL,
 created_at_onchain timestamptz, liquidity_usd exact_nonnegative,
 lp_locked_status text NOT NULL CHECK (lp_locked_status IN ('locked','burned','unlocked','unknown')),
 lp_lock_source http_url, lp_lock_expires_at timestamptz, last_updated_at timestamptz NOT NULL,
 UNIQUE(data_origin,token_id,pool_address),
  UNIQUE (id, data_origin),
  FOREIGN KEY (token_id, data_origin) REFERENCES tokens(id, data_origin) ON DELETE RESTRICT,
  CHECK (data_origin <> 'DEMO' OR lp_lock_source ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);

CREATE TABLE token_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'INTERPRETED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  token_id uuid NOT NULL, event_id uuid NOT NULL, confidence_level confidence_level NOT NULL,
 official_evidence_id uuid, reasons jsonb NOT NULL CHECK (jsonb_typeof(reasons)='array'),
 counter_reasons jsonb NOT NULL CHECK (jsonb_typeof(counter_reasons)='array'),
 impersonation_flags jsonb NOT NULL CHECK (jsonb_typeof(impersonation_flags)='array'),
 time_delta_seconds numeric, algorithm_version text NOT NULL, computed_at timestamptz NOT NULL,
 CHECK (confidence_level <> 'CONFIRMED' OR official_evidence_id IS NOT NULL),
 FOREIGN KEY(official_evidence_id,data_origin,token_id) REFERENCES official_contract_evidence(id,data_origin,token_id),
 UNIQUE(data_origin,token_id,event_id,algorithm_version),
  UNIQUE (id, data_origin),
  FOREIGN KEY (token_id, data_origin) REFERENCES tokens(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (event_id, data_origin) REFERENCES events(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE market_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  token_id uuid NOT NULL, observed_at timestamptz NOT NULL, provider text NOT NULL,
 metric text NOT NULL CHECK (metric IN ('price_usd','price_quote','mcap_estimated','fdv','volume_5m','volume_1h','volume_6h','volume_24h','liquidity_usd','tx_count','buyers','sellers','price_change_5m','price_change_1h','price_change_6h','price_change_24h')),
 value numeric CHECK (value::text NOT IN ('NaN','Infinity','-Infinity')), unit text NOT NULL,
 missing_reason text, provider_timestamp timestamptz, source_url http_url NOT NULL,
 quality_flags text[] NOT NULL DEFAULT '{}' CHECK (quality_flags <@ ARRAY['stale','inconsistent','unverifiable_volume','outlier']),
 CHECK ((value IS NULL)=(missing_reason IS NOT NULL)),
 CHECK (metric LIKE 'price_change_%' OR value>=0), UNIQUE(data_origin,token_id,provider,metric,observed_at),
  UNIQUE (id, data_origin),
  FOREIGN KEY (token_id, data_origin) REFERENCES tokens(id, data_origin) ON DELETE RESTRICT,
  CHECK (data_origin <> 'DEMO' OR source_url ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);

CREATE TABLE holder_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  token_id uuid NOT NULL, observed_at timestamptz NOT NULL, top_holders jsonb NOT NULL CHECK (jsonb_typeof(top_holders)='array'),
 top1_pct_excluding_known percentage, top10_pct_excluding_known percentage, top20_pct_excluding_known percentage,
 creator_pct percentage, holder_count bigint CHECK (holder_count>=0), provider text NOT NULL, source_url http_url NOT NULL,
 limitations text NOT NULL, UNIQUE(data_origin,token_id,provider,observed_at),
  UNIQUE (id, data_origin),
  FOREIGN KEY (token_id, data_origin) REFERENCES tokens(id, data_origin) ON DELETE RESTRICT,
  CHECK (data_origin <> 'DEMO' OR source_url ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);

CREATE TABLE risk_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'INTERPRETED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  token_id uuid NOT NULL, check_type text NOT NULL, status risk_status NOT NULL,
 severity text NOT NULL CHECK (severity IN ('info','low','medium','high')),
 evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object'), limitations text NOT NULL,
 checked_at timestamptz NOT NULL, checker_version text NOT NULL,
 UNIQUE(data_origin,token_id,check_type,checked_at,checker_version),
  UNIQUE (id, data_origin),
  FOREIGN KEY (token_id, data_origin) REFERENCES tokens(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE wallet_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  token_id uuid NOT NULL, wallet_address text NOT NULL, direction text NOT NULL CHECK (direction IN ('in','out')),
 amount_raw raw_quantity NOT NULL, amount_usd exact_nonnegative, tx text NOT NULL, log_index integer NOT NULL CHECK (log_index>=0),
 observed_at timestamptz NOT NULL, provider text NOT NULL, source_url http_url NOT NULL,
 UNIQUE(data_origin,token_id,tx,log_index,wallet_address,direction),
  UNIQUE (id, data_origin),
  FOREIGN KEY (token_id, data_origin) REFERENCES tokens(id, data_origin) ON DELETE RESTRICT,
  CHECK (data_origin <> 'DEMO' OR source_url ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);

CREATE TABLE indicator_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'CALCULATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid, token_id uuid, indicator indicator_kind NOT NULL,
 level text NOT NULL CHECK (level IN ('VERY_LOW','LOW','MODERATE','HIGH','VERY_HIGH','INSUFFICIENT_DATA')),
 inputs_used jsonb NOT NULL CHECK (jsonb_typeof(inputs_used)='array'), factors jsonb NOT NULL CHECK (jsonb_typeof(factors)='array'),
 missing_inputs jsonb NOT NULL CHECK (jsonb_typeof(missing_inputs)='array'), algorithm_version text NOT NULL,
 computed_at timestamptz NOT NULL, CHECK (num_nonnulls(event_id,token_id)=1),
 CHECK (level<>'INSUFFICIENT_DATA' OR jsonb_array_length(missing_inputs)>0),
  UNIQUE (id, data_origin),
  FOREIGN KEY (event_id, data_origin) REFERENCES events(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (token_id, data_origin) REFERENCES tokens(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL, type text NOT NULL CHECK (type IN ('news','token_link','attention_acceleration','liquidity_change','wallet_movement','risk_signal','source_degradation')),
 conditions jsonb NOT NULL CHECK (jsonb_typeof(conditions)='object'),
 channels text[] NOT NULL CHECK (cardinality(channels)>0 AND channels <@ ARRAY['in_app','smtp','webhook','telegram','discord']),
 cooldown_seconds integer NOT NULL CHECK (cooldown_seconds>=0), min_confidence confidence_level NOT NULL,
 quiet_hours jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(quiet_hours)='object'),
 min_data_quality fraction NOT NULL, enabled boolean NOT NULL DEFAULT false,
  UNIQUE (id, data_origin),
  FOREIGN KEY (user_id, data_origin) REFERENCES users(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE alert_subject_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'CALCULATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  rule_id uuid NOT NULL, event_id uuid, token_id uuid, source_id uuid,
 armed boolean NOT NULL DEFAULT true, last_triggered_at timestamptz, cooldown_until timestamptz,
 pending_group_until timestamptz, CHECK(num_nonnulls(event_id,token_id,source_id)=1),
 UNIQUE NULLS NOT DISTINCT(data_origin,rule_id,event_id,token_id,source_id),
  UNIQUE (id, data_origin),
  FOREIGN KEY (rule_id, data_origin) REFERENCES alert_rules(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (event_id, data_origin) REFERENCES events(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (token_id, data_origin) REFERENCES tokens(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (source_id, data_origin) REFERENCES sources(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'CALCULATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  rule_id uuid NOT NULL, event_id uuid, token_id uuid, source_id uuid,
 triggered_at timestamptz NOT NULL, reason text NOT NULL, observed_data jsonb NOT NULL CHECK (jsonb_typeof(observed_data)='object'),
 sources jsonb NOT NULL CHECK (jsonb_typeof(sources)='array'), fingerprint text NOT NULL,
 status text NOT NULL CHECK (status IN ('pending','sent','suppressed','acknowledged','dismissed_false_positive')),
 suppression_reason text, feedback_at timestamptz,
 CHECK(num_nonnulls(event_id,token_id,source_id)=1), CHECK ((status='suppressed')=(suppression_reason IS NOT NULL)),
 UNIQUE(data_origin,fingerprint),
  UNIQUE (id, data_origin),
  FOREIGN KEY (rule_id, data_origin) REFERENCES alert_rules(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (event_id, data_origin) REFERENCES events(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (token_id, data_origin) REFERENCES tokens(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (source_id, data_origin) REFERENCES sources(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  alert_id uuid NOT NULL, channel text NOT NULL CHECK (channel IN ('in_app','smtp','webhook','telegram','discord')),
 destination_ref text NOT NULL, status text NOT NULL CHECK (status IN ('pending','processing','sent','failed','cancelled')),
 idempotency_key text NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
 next_attempt_at timestamptz, sent_at timestamptz, last_error_code text,
 UNIQUE(data_origin,idempotency_key), CHECK(data_origin<>'DEMO' OR channel='in_app'),
  UNIQUE (id, data_origin),
  FOREIGN KEY (alert_id, data_origin) REFERENCES alerts(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE provider_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_id uuid, provider text NOT NULL, endpoint_template text NOT NULL,
 status_code integer CHECK (status_code BETWEEN 100 AND 599), latency_ms integer CHECK (latency_ms>=0),
 quota_remaining bigint CHECK (quota_remaining>=0), error_code text, correlation_id uuid NOT NULL, observed_at timestamptz NOT NULL,
  UNIQUE (id, data_origin),
  FOREIGN KEY (source_id, data_origin) REFERENCES sources(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid, action text NOT NULL, target_type text NOT NULL, target_id uuid,
 changes_redacted jsonb NOT NULL CHECK (jsonb_typeof(changes_redacted)='object'), occurred_at timestamptz NOT NULL,
 correlation_id uuid NOT NULL,
  UNIQUE (id, data_origin),
  FOREIGN KEY (actor_user_id, data_origin) REFERENCES users(id, data_origin) ON DELETE RESTRICT
);

CREATE TABLE app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  key text NOT NULL, value jsonb NOT NULL, UNIQUE(data_origin,key),
  UNIQUE (id, data_origin)
);

CREATE TABLE outbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_type text NOT NULL, subject_id uuid NOT NULL, payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
 idempotency_key text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','published','failed')),
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, published_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0), last_error_code text,
 UNIQUE(data_origin,idempotency_key),
  UNIQUE (id, data_origin)
);

CREATE TABLE processed_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  consumer text NOT NULL, idempotency_key text NOT NULL, completed_at timestamptz NOT NULL,
 UNIQUE(data_origin,consumer,idempotency_key),
  UNIQUE (id, data_origin)
);

CREATE TABLE evidence_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_id uuid NOT NULL, raw_item_id uuid, source_url http_url NOT NULL, observed_at timestamptz NOT NULL,
 fetched_at timestamptz NOT NULL, payload_ref text, payload_expires_at timestamptz, purged_at timestamptz,
 content_hash text CHECK(content_hash ~ '^[a-f0-9]{64}$'), description text NOT NULL,
 FOREIGN KEY(raw_item_id,data_origin,source_id) REFERENCES raw_items(id,data_origin,source_id),
  UNIQUE (id, data_origin),
  FOREIGN KEY (source_id, data_origin) REFERENCES sources(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (raw_item_id, data_origin) REFERENCES raw_items(id, data_origin) ON DELETE RESTRICT,
  CHECK (data_origin <> 'DEMO' OR source_url ~ '^https://demo[.]memeradar[.]invalid(/|$)')
);

CREATE TABLE analysis_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_origin data_origin NOT NULL,
  knowledge_kind knowledge_kind NOT NULL DEFAULT 'OBSERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  evidence_id uuid NOT NULL, token_event_link_id uuid, indicator_result_id uuid, risk_finding_id uuid,
 market_observation_id uuid, holder_snapshot_id uuid, wallet_movement_id uuid, alert_id uuid,
 CHECK(num_nonnulls(token_event_link_id,indicator_result_id,risk_finding_id,market_observation_id,holder_snapshot_id,wallet_movement_id,alert_id)=1),
  UNIQUE (id, data_origin),
  FOREIGN KEY (evidence_id, data_origin) REFERENCES evidence_records(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (token_event_link_id, data_origin) REFERENCES token_event_links(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (indicator_result_id, data_origin) REFERENCES indicator_results(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (risk_finding_id, data_origin) REFERENCES risk_findings(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (market_observation_id, data_origin) REFERENCES market_observations(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (holder_snapshot_id, data_origin) REFERENCES holder_snapshots(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (wallet_movement_id, data_origin) REFERENCES wallet_movements(id, data_origin) ON DELETE RESTRICT,
  FOREIGN KEY (alert_id, data_origin) REFERENCES alerts(id, data_origin) ON DELETE RESTRICT
);
CREATE INDEX sessions_user_id_fk_idx ON sessions(data_origin,user_id);
CREATE INDEX source_cursors_source_id_fk_idx ON source_cursors(data_origin,source_id);
CREATE INDEX raw_items_source_id_fk_idx ON raw_items(data_origin,source_id);
CREATE INDEX raw_item_entities_raw_item_id_fk_idx ON raw_item_entities(data_origin,raw_item_id);
CREATE INDEX raw_item_entities_entity_id_fk_idx ON raw_item_entities(data_origin,entity_id);
CREATE INDEX event_items_event_id_fk_idx ON event_items(data_origin,event_id);
CREATE INDEX event_items_raw_item_id_fk_idx ON event_items(data_origin,raw_item_id);
CREATE INDEX attention_snapshots_event_id_fk_idx ON attention_snapshots(data_origin,event_id);
CREATE INDEX attention_snapshots_entity_id_fk_idx ON attention_snapshots(data_origin,entity_id);
CREATE INDEX watchlists_user_id_fk_idx ON watchlists(data_origin,user_id);
CREATE INDEX watchlist_items_watchlist_id_fk_idx ON watchlist_items(data_origin,watchlist_id);
CREATE INDEX tokens_chain_id_fk_idx ON tokens(data_origin,chain_id);
CREATE INDEX official_contract_evidence_entity_id_fk_idx ON official_contract_evidence(data_origin,entity_id);
CREATE INDEX official_contract_evidence_source_id_fk_idx ON official_contract_evidence(data_origin,source_id);
CREATE INDEX official_contract_evidence_raw_item_id_fk_idx ON official_contract_evidence(data_origin,raw_item_id);
CREATE INDEX pools_token_id_fk_idx ON pools(data_origin,token_id);
CREATE INDEX token_event_links_token_id_fk_idx ON token_event_links(data_origin,token_id);
CREATE INDEX token_event_links_event_id_fk_idx ON token_event_links(data_origin,event_id);
CREATE INDEX market_observations_token_id_fk_idx ON market_observations(data_origin,token_id);
CREATE INDEX holder_snapshots_token_id_fk_idx ON holder_snapshots(data_origin,token_id);
CREATE INDEX risk_findings_token_id_fk_idx ON risk_findings(data_origin,token_id);
CREATE INDEX wallet_movements_token_id_fk_idx ON wallet_movements(data_origin,token_id);
CREATE INDEX indicator_results_event_id_fk_idx ON indicator_results(data_origin,event_id);
CREATE INDEX indicator_results_token_id_fk_idx ON indicator_results(data_origin,token_id);
CREATE INDEX alert_rules_user_id_fk_idx ON alert_rules(data_origin,user_id);
CREATE INDEX alert_subject_states_rule_id_fk_idx ON alert_subject_states(data_origin,rule_id);
CREATE INDEX alert_subject_states_event_id_fk_idx ON alert_subject_states(data_origin,event_id);
CREATE INDEX alert_subject_states_token_id_fk_idx ON alert_subject_states(data_origin,token_id);
CREATE INDEX alert_subject_states_source_id_fk_idx ON alert_subject_states(data_origin,source_id);
CREATE INDEX alerts_rule_id_fk_idx ON alerts(data_origin,rule_id);
CREATE INDEX alerts_event_id_fk_idx ON alerts(data_origin,event_id);
CREATE INDEX alerts_token_id_fk_idx ON alerts(data_origin,token_id);
CREATE INDEX alerts_source_id_fk_idx ON alerts(data_origin,source_id);
CREATE INDEX notification_deliveries_alert_id_fk_idx ON notification_deliveries(data_origin,alert_id);
CREATE INDEX provider_calls_source_id_fk_idx ON provider_calls(data_origin,source_id);
CREATE INDEX audit_log_actor_user_id_fk_idx ON audit_log(data_origin,actor_user_id);
CREATE INDEX evidence_records_source_id_fk_idx ON evidence_records(data_origin,source_id);
CREATE INDEX evidence_records_raw_item_id_fk_idx ON evidence_records(data_origin,raw_item_id);
CREATE INDEX analysis_evidence_evidence_id_fk_idx ON analysis_evidence(data_origin,evidence_id);
CREATE INDEX analysis_evidence_token_event_link_id_fk_idx ON analysis_evidence(data_origin,token_event_link_id);
CREATE INDEX analysis_evidence_indicator_result_id_fk_idx ON analysis_evidence(data_origin,indicator_result_id);
CREATE INDEX analysis_evidence_risk_finding_id_fk_idx ON analysis_evidence(data_origin,risk_finding_id);
CREATE INDEX analysis_evidence_market_observation_id_fk_idx ON analysis_evidence(data_origin,market_observation_id);
CREATE INDEX analysis_evidence_holder_snapshot_id_fk_idx ON analysis_evidence(data_origin,holder_snapshot_id);
CREATE INDEX analysis_evidence_wallet_movement_id_fk_idx ON analysis_evidence(data_origin,wallet_movement_id);
CREATE INDEX analysis_evidence_alert_id_fk_idx ON analysis_evidence(data_origin,alert_id);
CREATE INDEX users_origin_idx ON users(data_origin);
COMMENT ON TABLE users IS 'Origin-scoped users; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX sessions_origin_idx ON sessions(data_origin);
COMMENT ON TABLE sessions IS 'Origin-scoped sessions; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX sources_origin_idx ON sources(data_origin);
COMMENT ON TABLE sources IS 'Origin-scoped sources; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX source_cursors_origin_idx ON source_cursors(data_origin);
COMMENT ON TABLE source_cursors IS 'Origin-scoped source_cursors; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX raw_items_origin_idx ON raw_items(data_origin);
COMMENT ON TABLE raw_items IS 'Origin-scoped raw_items; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX entities_origin_idx ON entities(data_origin);
COMMENT ON TABLE entities IS 'Origin-scoped entities; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX raw_item_entities_origin_idx ON raw_item_entities(data_origin);
COMMENT ON TABLE raw_item_entities IS 'Origin-scoped raw_item_entities; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX events_origin_idx ON events(data_origin);
COMMENT ON TABLE events IS 'Origin-scoped events; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX event_items_origin_idx ON event_items(data_origin);
COMMENT ON TABLE event_items IS 'Origin-scoped event_items; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX attention_snapshots_origin_idx ON attention_snapshots(data_origin);
COMMENT ON TABLE attention_snapshots IS 'Origin-scoped attention_snapshots; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX watchlists_origin_idx ON watchlists(data_origin);
COMMENT ON TABLE watchlists IS 'Origin-scoped watchlists; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX watchlist_items_origin_idx ON watchlist_items(data_origin);
COMMENT ON TABLE watchlist_items IS 'Origin-scoped watchlist_items; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX chains_origin_idx ON chains(data_origin);
COMMENT ON TABLE chains IS 'Origin-scoped chains; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX tokens_origin_idx ON tokens(data_origin);
COMMENT ON TABLE tokens IS 'Origin-scoped tokens; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX official_contract_evidence_origin_idx ON official_contract_evidence(data_origin);
COMMENT ON TABLE official_contract_evidence IS 'Origin-scoped official_contract_evidence; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX pools_origin_idx ON pools(data_origin);
COMMENT ON TABLE pools IS 'Origin-scoped pools; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX token_event_links_origin_idx ON token_event_links(data_origin);
COMMENT ON TABLE token_event_links IS 'Origin-scoped token_event_links; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX market_observations_origin_idx ON market_observations(data_origin);
COMMENT ON TABLE market_observations IS 'Origin-scoped market_observations; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX holder_snapshots_origin_idx ON holder_snapshots(data_origin);
COMMENT ON TABLE holder_snapshots IS 'Origin-scoped holder_snapshots; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX risk_findings_origin_idx ON risk_findings(data_origin);
COMMENT ON TABLE risk_findings IS 'Origin-scoped risk_findings; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX wallet_movements_origin_idx ON wallet_movements(data_origin);
COMMENT ON TABLE wallet_movements IS 'Origin-scoped wallet_movements; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX indicator_results_origin_idx ON indicator_results(data_origin);
COMMENT ON TABLE indicator_results IS 'Origin-scoped indicator_results; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX alert_rules_origin_idx ON alert_rules(data_origin);
COMMENT ON TABLE alert_rules IS 'Origin-scoped alert_rules; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX alert_subject_states_origin_idx ON alert_subject_states(data_origin);
COMMENT ON TABLE alert_subject_states IS 'Origin-scoped alert_subject_states; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX alerts_origin_idx ON alerts(data_origin);
COMMENT ON TABLE alerts IS 'Origin-scoped alerts; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX notification_deliveries_origin_idx ON notification_deliveries(data_origin);
COMMENT ON TABLE notification_deliveries IS 'Origin-scoped notification_deliveries; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX provider_calls_origin_idx ON provider_calls(data_origin);
COMMENT ON TABLE provider_calls IS 'Origin-scoped provider_calls; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX audit_log_origin_idx ON audit_log(data_origin);
COMMENT ON TABLE audit_log IS 'Origin-scoped audit_log; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX app_settings_origin_idx ON app_settings(data_origin);
COMMENT ON TABLE app_settings IS 'Origin-scoped app_settings; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX outbox_messages_origin_idx ON outbox_messages(data_origin);
COMMENT ON TABLE outbox_messages IS 'Origin-scoped outbox_messages; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX processed_jobs_origin_idx ON processed_jobs(data_origin);
COMMENT ON TABLE processed_jobs IS 'Origin-scoped processed_jobs; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX evidence_records_origin_idx ON evidence_records(data_origin);
COMMENT ON TABLE evidence_records IS 'Origin-scoped evidence_records; composite foreign keys prevent DEMO/REAL references.';
CREATE INDEX analysis_evidence_origin_idx ON analysis_evidence(data_origin);
COMMENT ON TABLE analysis_evidence IS 'Origin-scoped analysis_evidence; composite foreign keys prevent DEMO/REAL references.';

CREATE INDEX raw_items_hash_idx ON raw_items(data_origin,content_hash);
CREATE INDEX raw_items_simhash_idx ON raw_items(data_origin,simhash);
CREATE INDEX raw_items_published_idx ON raw_items(data_origin,published_at DESC);
CREATE INDEX raw_items_title_trgm_idx ON raw_items USING gin(title gin_trgm_ops);
CREATE INDEX events_status_idx ON events(data_origin,status,first_detected_at DESC);
CREATE UNIQUE INDEX attention_subject_bucket_idx ON attention_snapshots(data_origin,event_id,entity_id,bucket_start,bucket_size_seconds) NULLS NOT DISTINCT;
CREATE INDEX market_history_idx ON market_observations(data_origin,token_id,metric,observed_at DESC);
CREATE INDEX risk_history_idx ON risk_findings(data_origin,token_id,checked_at DESC);
CREATE INDEX holders_history_idx ON holder_snapshots(data_origin,token_id,observed_at DESC);
CREATE INDEX wallet_history_idx ON wallet_movements(data_origin,token_id,observed_at DESC);
CREATE INDEX indicators_subject_idx ON indicator_results(data_origin,token_id,event_id,computed_at DESC);
CREATE INDEX alerts_history_idx ON alerts(data_origin,triggered_at DESC);
CREATE INDEX outbox_pending_idx ON outbox_messages(data_origin,available_at) WHERE status IN ('pending','processing');
CREATE INDEX delivery_pending_idx ON notification_deliveries(data_origin,next_attempt_at) WHERE status IN ('pending','processing');
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX raw_items_retention_idx ON raw_items(excerpt_expires_at) WHERE purged_at IS NULL;
CREATE INDEX provider_calls_retention_idx ON provider_calls(data_origin,observed_at);
CREATE INDEX audit_log_history_idx ON audit_log(data_origin,occurred_at DESC);

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=memeradar,pg_temp AS $$
BEGIN
 NEW.updated_at := clock_timestamp();
 IF NEW.data_origin IS DISTINCT FROM OLD.data_origin THEN
   RAISE EXCEPTION 'data_origin is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER sessions_updated BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER sources_updated BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER source_cursors_updated BEFORE UPDATE ON source_cursors FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER raw_items_updated BEFORE UPDATE ON raw_items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER entities_updated BEFORE UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER raw_item_entities_updated BEFORE UPDATE ON raw_item_entities FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER events_updated BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER event_items_updated BEFORE UPDATE ON event_items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER attention_snapshots_updated BEFORE UPDATE ON attention_snapshots FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER watchlists_updated BEFORE UPDATE ON watchlists FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER watchlist_items_updated BEFORE UPDATE ON watchlist_items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER chains_updated BEFORE UPDATE ON chains FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER tokens_updated BEFORE UPDATE ON tokens FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER official_contract_evidence_updated BEFORE UPDATE ON official_contract_evidence FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER pools_updated BEFORE UPDATE ON pools FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER token_event_links_updated BEFORE UPDATE ON token_event_links FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER market_observations_updated BEFORE UPDATE ON market_observations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER holder_snapshots_updated BEFORE UPDATE ON holder_snapshots FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER risk_findings_updated BEFORE UPDATE ON risk_findings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER wallet_movements_updated BEFORE UPDATE ON wallet_movements FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER indicator_results_updated BEFORE UPDATE ON indicator_results FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER alert_rules_updated BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER alert_subject_states_updated BEFORE UPDATE ON alert_subject_states FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER alerts_updated BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER notification_deliveries_updated BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER provider_calls_updated BEFORE UPDATE ON provider_calls FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER audit_log_updated BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER app_settings_updated BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER outbox_messages_updated BEFORE UPDATE ON outbox_messages FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER processed_jobs_updated BEFORE UPDATE ON processed_jobs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER evidence_records_updated BEFORE UPDATE ON evidence_records FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER analysis_evidence_updated BEFORE UPDATE ON analysis_evidence FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Validate official proof metadata and prevent subsequent mutation of its anchors.
CREATE FUNCTION validate_official_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=memeradar,pg_temp AS $$
BEGIN
 PERFORM 1 FROM sources s JOIN raw_items r ON r.source_id=s.id AND r.data_origin=s.data_origin
 WHERE s.id=NEW.source_id AND s.data_origin=NEW.data_origin AND s.reliability_tier='A'
 AND r.id=NEW.raw_item_id AND r.published_at=NEW.published_at AND r.url=NEW.evidence_url FOR SHARE OF s,r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Official evidence requires a matching tier A publication' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER official_evidence_validate BEFORE INSERT OR UPDATE ON official_contract_evidence
 FOR EACH ROW EXECUTE FUNCTION validate_official_evidence();
CREATE FUNCTION protect_official_anchor() RETURNS trigger LANGUAGE plpgsql SET search_path=memeradar,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='sources' THEN
   IF NEW.reliability_tier IS DISTINCT FROM OLD.reliability_tier AND EXISTS
      (SELECT 1 FROM official_contract_evidence WHERE source_id=OLD.id) THEN
      RAISE EXCEPTION 'Official source is referenced; retract dependent links before correction' USING ERRCODE='23514';
   END IF;
 ELSE
   IF (NEW.source_id,NEW.published_at,NEW.url) IS DISTINCT FROM (OLD.source_id,OLD.published_at,OLD.url)
      AND EXISTS (SELECT 1 FROM official_contract_evidence WHERE raw_item_id=OLD.id) THEN
      RAISE EXCEPTION 'Official publication anchor is referenced' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sources_protect_official BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION protect_official_anchor();
CREATE TRIGGER raw_items_protect_official BEFORE UPDATE ON raw_items FOR EACH ROW EXECUTE FUNCTION protect_official_anchor();

COMMENT ON COLUMN tokens.contract_address IS 'SQL checks shape only. Application must validate chain-specific EIP-55 or decoded Solana bytes; DEMO uses a separate recognisable format.';
COMMENT ON COLUMN official_contract_evidence.exact_address_published IS 'Assertion established by verified extraction/review, not by token name. SQL cannot authenticate a website or prove its content.';
COMMENT ON COLUMN raw_items.simhash IS 'Equality index only; Hamming distance filtering belongs to the application.';
COMMENT ON COLUMN outbox_messages.subject_id IS 'Operational routing identifier, not a domain relationship. Consumers validate subject existence and origin.';
COMMENT ON COLUMN provider_calls.endpoint_template IS 'Route template only. Never persist query strings, headers, tokens or raw provider errors.';
COMMENT ON COLUMN users.password_hash IS 'Argon2id encoded hash; never plaintext.';
INSERT INTO schema_migrations(version) VALUES ('0001_initial');
COMMIT;
