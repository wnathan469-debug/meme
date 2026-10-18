\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=memeradar,public;
CREATE TEMP TABLE test_results(name text PRIMARY KEY);
CREATE FUNCTION pg_temp.assert_true(name text, actual boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF actual IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',name; END IF;
 INSERT INTO test_results VALUES(name);
END $$;
CREATE FUNCTION pg_temp.expect_error(name text, statement text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
   EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE <> expected_state THEN RAISE EXCEPTION 'FAIL: %, expected %, got %: %',name,expected_state,SQLSTATE,SQLERRM; END IF;
   rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL: %, invalid statement accepted',name; END IF;
 INSERT INTO test_results VALUES(name);
END $$;

DO $$
DECLARE
 source_demo uuid; source_real uuid; source_b uuid; item_demo uuid; item_b uuid;
 entity_demo uuid; event_demo uuid; event_real uuid; chain_demo uuid; chain_real uuid;
 token_demo uuid; token_real uuid; proof uuid; link uuid; admin uuid; rule uuid; alert uuid;
 indicator uuid; evidence uuid; before_update timestamptz;
BEGIN
 INSERT INTO sources(data_origin,type,name,base_url,reliability_tier,reliability_notes)
 VALUES('DEMO','official_press','[DÉMO] Agence Boréale','https://demo.memeradar.invalid/press','A','Fictif') RETURNING id INTO source_demo;
 INSERT INTO sources(data_origin,type,name,base_url,reliability_tier,reliability_notes)
 VALUES('REAL','rss','Test local sans réseau','https://example.invalid/rss','B','Fixture seulement') RETURNING id INTO source_real;
 INSERT INTO sources(data_origin,type,name,base_url,reliability_tier,reliability_notes)
 VALUES('DEMO','rss','[DÉMO] Média','https://demo.memeradar.invalid/media','B','Fictif') RETURNING id INTO source_b;
 INSERT INTO raw_items(data_origin,source_id,external_id,url,canonical_url,title,published_at,fetched_at,content_hash)
 VALUES('DEMO',source_demo,'article-1','https://demo.memeradar.invalid/press/1','https://demo.memeradar.invalid/press/1','[DÉMO] Article',now()-interval '5 minutes',now(),repeat('a',64)) RETURNING id INTO item_demo;
 INSERT INTO raw_items(data_origin,source_id,external_id,url,canonical_url,title,published_at,fetched_at,content_hash)
 VALUES('DEMO',source_b,'article-2','https://demo.memeradar.invalid/media/1','https://demo.memeradar.invalid/media/1','[DÉMO] Reprise',now(),now(),repeat('b',64)) RETURNING id INTO item_b;
 INSERT INTO entities(data_origin,type,canonical_name) VALUES('DEMO','company','[DÉMO] Agence Boréale') RETURNING id INTO entity_demo;
 INSERT INTO events(data_origin,title,summary,summary_method,first_published_at,first_detected_at,status,source_reliability_level,popularity_level)
 VALUES('DEMO','[DÉMO] Événement','Exemple fictif','extractive',now()-interval '5 minutes',now(),'active','A','HIGH') RETURNING id INTO event_demo;
 INSERT INTO events(data_origin,title,summary,summary_method,first_published_at,first_detected_at,status,source_reliability_level,popularity_level)
 VALUES('REAL','Fixture locale','Sans réseau','manual',now(),now(),'active','B','LOW') RETURNING id INTO event_real;
 INSERT INTO chains(data_origin,slug,family,evm_chain_id,explorer_url)
 VALUES('DEMO','base','evm',8453,'https://demo.memeradar.invalid/explorer') RETURNING id INTO chain_demo;
 INSERT INTO chains(data_origin,slug,family,evm_chain_id,explorer_url)
 VALUES('REAL','base','evm',8453,'https://example.invalid/explorer') RETURNING id INTO chain_real;
 INSERT INTO tokens(data_origin,chain_id,contract_address,first_seen_by_app_at,total_supply_raw)
 VALUES('DEMO',chain_demo,'0xDEMO'||repeat('0',35)||'1',now(),1234567890123456789012345678901234567890) RETURNING id INTO token_demo;
 INSERT INTO tokens(data_origin,chain_id,contract_address,first_seen_by_app_at)
 VALUES('REAL',chain_real,'0x'||repeat('1',40),now()) RETURNING id INTO token_real;

 PERFORM pg_temp.assert_true('33 origin-scoped application tables',
  (SELECT count(*)=33 FROM information_schema.columns WHERE table_schema='memeradar' AND column_name='data_origin' AND is_nullable='NO'));
 PERFORM pg_temp.assert_true('all origin columns indexed', NOT EXISTS(
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='data_origin'
  WHERE n.nspname='memeradar' AND c.relkind='r' AND NOT EXISTS(
    SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indkey[0]=a.attnum)));
 PERFORM pg_temp.assert_true('all foreign keys contain origin',NOT EXISTS(
  SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
  WHERE n.nspname='memeradar' AND c.contype='f' AND NOT EXISTS(
    SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attname='data_origin' AND a.attnum=ANY(c.conkey))));
 PERFORM pg_temp.assert_true('all application tables timestamp triggers',
  (SELECT count(*)=33 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='memeradar' AND t.tgname LIKE '%_updated' AND NOT t.tgisinternal));
 PERFORM pg_temp.assert_true('exact raw integer retained',
  (SELECT total_supply_raw=1234567890123456789012345678901234567890 FROM tokens WHERE id=token_demo));
 PERFORM pg_temp.assert_true('latency generated', (SELECT detection_latency_seconds=300 FROM events WHERE id=event_demo));
 PERFORM pg_temp.assert_true('calculated event labelled', (SELECT knowledge_kind='CALCULATED' FROM events WHERE id=event_demo));

 PERFORM pg_temp.expect_error('origin required', $q$INSERT INTO app_settings(key,value) VALUES('x','{}')$q$,'23502');
 PERFORM pg_temp.expect_error('origin immutable',format('UPDATE events SET data_origin=''REAL'' WHERE id=%L',event_demo),'23514');
 PERFORM pg_temp.expect_error('raw item cross-origin rejected',format($q$
  INSERT INTO raw_items(data_origin,source_id,external_id,url,canonical_url,title,published_at,fetched_at,content_hash)
  VALUES('DEMO',%L,'bad','https://demo.memeradar.invalid/1','https://demo.memeradar.invalid/1','x',now(),now(),repeat('a',64))$q$,source_real),'23503');
 INSERT INTO event_items(data_origin,event_id,raw_item_id,similarity_score) VALUES('DEMO',event_demo,item_demo,0.8);
 PERFORM pg_temp.expect_error('event join cross-origin rejected',format($q$
  INSERT INTO event_items(data_origin,event_id,raw_item_id,similarity_score) VALUES('DEMO',%L,%L,0.8)$q$,event_real,item_demo),'23503');
 PERFORM pg_temp.expect_error('raw duplicate rejected',format($q$
  INSERT INTO raw_items(data_origin,source_id,external_id,url,canonical_url,title,published_at,fetched_at,content_hash)
  VALUES('DEMO',%L,'article-1','https://demo.memeradar.invalid/1','https://demo.memeradar.invalid/1','x',now(),now(),repeat('a',64))$q$,source_demo),'23505');
 PERFORM pg_temp.expect_error('token duplicate rejected',format($q$
  INSERT INTO tokens(data_origin,chain_id,contract_address,first_seen_by_app_at) VALUES('DEMO',%L,'0xDEMO'||repeat('0',35)||'1',now())$q$,chain_demo),'23505');
 PERFORM pg_temp.expect_error('demo address rejected in REAL',format($q$
  INSERT INTO tokens(data_origin,chain_id,contract_address,first_seen_by_app_at) VALUES('REAL',%L,'0xDEMO'||repeat('0',35)||'2',now())$q$,chain_real),'23514');
 PERFORM pg_temp.expect_error('real address rejected in DEMO',format($q$
  INSERT INTO tokens(data_origin,chain_id,contract_address,first_seen_by_app_at) VALUES('DEMO',%L,'0x'||repeat('2',40),now())$q$,chain_demo),'23514');
 INSERT INTO tokens(data_origin,chain_id,contract_address,first_seen_by_app_at)
 VALUES('REAL',chain_real,'0x'||repeat('a',40),now());
 PERFORM pg_temp.expect_error('case-insensitive EVM identity deduplicated',format($q$
  INSERT INTO tokens(data_origin,chain_id,contract_address,first_seen_by_app_at) VALUES('REAL',%L,'0x'||repeat('A',40),now())$q$,chain_real),'23505');
 PERFORM pg_temp.expect_error('fractional raw quantity rejected',format('UPDATE tokens SET total_supply_raw=1.5 WHERE id=%L',token_demo),'23514');
 PERFORM pg_temp.expect_error('NaN raw quantity rejected',format('UPDATE tokens SET total_supply_raw=''NaN'' WHERE id=%L',token_demo),'23514');
 PERFORM pg_temp.expect_error('unsafe URL scheme rejected',format('UPDATE sources SET base_url=''file:///etc/passwd'' WHERE id=%L',source_real),'23514');
 PERFORM pg_temp.expect_error('demo external source rejected',format('UPDATE sources SET base_url=''https://example.org'' WHERE id=%L',source_demo),'23514');
 PERFORM pg_temp.expect_error('EVM chain id cannot be absent',$q$INSERT INTO chains(data_origin,slug,family,explorer_url) VALUES('REAL','ethereum','evm','https://example.invalid')$q$,'23514');

 PERFORM pg_temp.expect_error('CONFIRMED requires evidence',format($q$
 INSERT INTO token_event_links(data_origin,token_id,event_id,confidence_level,reasons,counter_reasons,impersonation_flags,algorithm_version,computed_at)
 VALUES('DEMO',%L,%L,'CONFIRMED','[]','[]','[]','association@1',now())$q$,token_demo,event_demo),'23514');
 PERFORM pg_temp.expect_error('nonofficial proof rejected',format($q$
 INSERT INTO official_contract_evidence(data_origin,entity_id,token_id,chain_id,contract_address,source_id,raw_item_id,published_at,evidence_url,exact_address_published)
 VALUES('DEMO',%L,%L,%L,'0xDEMO'||repeat('0',35)||'1',%L,%L,now(),'https://demo.memeradar.invalid/media/1',true)$q$,entity_demo,token_demo,chain_demo,source_b,item_b),'23514');
 INSERT INTO official_contract_evidence(data_origin,entity_id,token_id,chain_id,contract_address,source_id,raw_item_id,published_at,evidence_url,exact_address_published)
 SELECT 'DEMO',entity_demo,token_demo,chain_demo,'0xDEMO'||repeat('0',35)||'1',source_demo,item_demo,published_at,url,true FROM raw_items WHERE id=item_demo RETURNING id INTO proof;
 INSERT INTO token_event_links(data_origin,token_id,event_id,confidence_level,official_evidence_id,reasons,counter_reasons,impersonation_flags,algorithm_version,computed_at)
 VALUES('DEMO',token_demo,event_demo,'CONFIRMED',proof,'[]','[]','[]','association@1',now()) RETURNING id INTO link;
 PERFORM pg_temp.assert_true('CONFIRMED with matching official proof accepted',link IS NOT NULL);
 PERFORM pg_temp.expect_error('proof address mismatch rejected',format('UPDATE official_contract_evidence SET contract_address=''0xDEMO''||repeat(''0'',35)||''9'' WHERE id=%L',proof),'23503');
 PERFORM pg_temp.expect_error('official source downgrade guarded',format('UPDATE sources SET reliability_tier=''B'' WHERE id=%L',source_demo),'23514');
 PERFORM pg_temp.expect_error('official publication mutation guarded',format('UPDATE raw_items SET url=''https://demo.memeradar.invalid/other'' WHERE id=%L',item_demo),'23514');
 PERFORM pg_temp.expect_error('referenced evidence cannot be deleted',format('DELETE FROM official_contract_evidence WHERE id=%L',proof),'23503');
 PERFORM pg_temp.expect_error('cross-origin token association rejected',format($q$
 INSERT INTO token_event_links(data_origin,token_id,event_id,confidence_level,reasons,counter_reasons,impersonation_flags,algorithm_version,computed_at)
 VALUES('DEMO',%L,%L,'WEAK','[]','[]','[]','association@1',now())$q$,token_real,event_demo),'23503');

 INSERT INTO attention_snapshots(data_origin,event_id,bucket_start,bucket_size_seconds,mention_count,data_completeness)
 VALUES('DEMO',event_demo,now(),300,12,0.7);
 PERFORM pg_temp.expect_error('attention has exactly one subject',format($q$
 INSERT INTO attention_snapshots(data_origin,event_id,entity_id,bucket_start,bucket_size_seconds,mention_count,data_completeness)
 VALUES('DEMO',%L,%L,now(),300,12,1)$q$,event_demo,entity_demo),'23514');
 PERFORM pg_temp.expect_error('nullable subject bucket still unique',format($q$
 INSERT INTO attention_snapshots(data_origin,event_id,bucket_start,bucket_size_seconds,mention_count,data_completeness)
 VALUES('DEMO',%L,now(),300,12,1)$q$,event_demo),'23505');
 PERFORM pg_temp.expect_error('completeness bounded',format('UPDATE attention_snapshots SET data_completeness=1.1 WHERE event_id=%L',event_demo),'23514');

 INSERT INTO market_observations(data_origin,token_id,observed_at,provider,metric,value,unit,source_url)
 VALUES('DEMO',token_demo,now(),'fixture','price_usd',0.000000000000000000000000000000000123,'USD','https://demo.memeradar.invalid/metric');
 PERFORM pg_temp.expect_error('DEMO metric external URL rejected',format('UPDATE market_observations SET source_url=''https://example.org'' WHERE token_id=%L',token_demo),'23514');
 PERFORM pg_temp.assert_true('tiny price exact',(SELECT value=0.000000000000000000000000000000000123 FROM market_observations WHERE token_id=token_demo));
 INSERT INTO market_observations(data_origin,token_id,observed_at,provider,metric,value,unit,missing_reason,source_url)
 VALUES('DEMO',token_demo,now(),'fixture','liquidity_usd',NULL,'USD','No pool found','https://demo.memeradar.invalid/metric');
 PERFORM pg_temp.assert_true('missing value remains null',(SELECT value IS NULL FROM market_observations WHERE token_id=token_demo AND metric='liquidity_usd'));
 PERFORM pg_temp.expect_error('missing value requires reason',format('UPDATE market_observations SET missing_reason=NULL WHERE token_id=%L AND metric=''liquidity_usd''',token_demo),'23514');
 PERFORM pg_temp.expect_error('negative price rejected',format('UPDATE market_observations SET value=-1 WHERE token_id=%L AND metric=''price_usd''',token_demo),'23514');
 PERFORM pg_temp.expect_error('infinite price rejected',format('UPDATE market_observations SET value=''Infinity'' WHERE token_id=%L AND metric=''price_usd''',token_demo),'23514');

 INSERT INTO indicator_results(data_origin,token_id,indicator,level,inputs_used,factors,missing_inputs,algorithm_version,computed_at)
 VALUES('DEMO',token_demo,'ONCHAIN_RISK','INSUFFICIENT_DATA','[]','[]','[{"name":"permissions","reason":"unavailable"}]','risk@1',now()) RETURNING id INTO indicator;
 PERFORM pg_temp.assert_true('insufficient indicator accepted',indicator IS NOT NULL);
 PERFORM pg_temp.expect_error('insufficient indicator must explain missing data',format('UPDATE indicator_results SET missing_inputs=''[]'' WHERE id=%L',indicator),'23514');
 PERFORM pg_temp.expect_error('indicator without subject rejected',$q$
 INSERT INTO indicator_results(data_origin,indicator,level,inputs_used,factors,missing_inputs,algorithm_version,computed_at)
 VALUES('DEMO','ONCHAIN_RISK','LOW','[]','[]','[]','risk@1',now())$q$,'23514');
 INSERT INTO evidence_records(data_origin,source_id,raw_item_id,source_url,observed_at,fetched_at,description)
 VALUES('DEMO',source_demo,item_demo,'https://demo.memeradar.invalid/proof',now(),now(),'Fictif') RETURNING id INTO evidence;
 INSERT INTO analysis_evidence(data_origin,evidence_id,indicator_result_id) VALUES('DEMO',evidence,indicator);
 PERFORM pg_temp.expect_error('provenance source must match publication',format($q$
 INSERT INTO evidence_records(data_origin,source_id,raw_item_id,source_url,observed_at,fetched_at,description)
 VALUES('DEMO',%L,%L,'https://demo.memeradar.invalid/proof',now(),now(),'Mismatch')$q$,source_b,item_demo),'23503');
 PERFORM pg_temp.assert_true('provenance linked by FK',EXISTS(SELECT 1 FROM analysis_evidence WHERE evidence_id=evidence));
 PERFORM pg_temp.expect_error('provenance cannot lose its source',format('DELETE FROM evidence_records WHERE id=%L',evidence),'23503');
 UPDATE raw_items SET body_excerpt=NULL,raw_payload_ref=NULL,purged_at=now() WHERE id=item_demo;
 PERFORM pg_temp.assert_true('retention keeps official anchor',(SELECT purged_at IS NOT NULL FROM raw_items WHERE id=item_demo));

 INSERT INTO users(data_origin,email,password_hash) VALUES('DEMO','admin@example.invalid','$argon2id$TEST_FIXTURE_NOT_A_LOGIN') RETURNING id INTO admin;
 INSERT INTO alert_rules(data_origin,user_id,type,conditions,channels,cooldown_seconds,min_confidence,min_data_quality)
 VALUES('DEMO',admin,'risk_signal','{}',ARRAY['in_app'],300,'WEAK',0.5) RETURNING id INTO rule;
 INSERT INTO alert_subject_states(data_origin,rule_id,token_id) VALUES('DEMO',rule,token_demo);
 PERFORM pg_temp.expect_error('one cooldown state per nullable subject',format($q$
 INSERT INTO alert_subject_states(data_origin,rule_id,token_id) VALUES('DEMO',%L,%L)$q$,rule,token_demo),'23505');
 INSERT INTO alerts(data_origin,rule_id,token_id,triggered_at,reason,observed_data,sources,fingerprint,status,suppression_reason)
 VALUES('DEMO',rule,token_demo,now(),'Fictif','{}','[]','fixture-fingerprint','suppressed','cooldown') RETURNING id INTO alert;
 PERFORM pg_temp.expect_error('alert fingerprint deduplicated',format($q$
 INSERT INTO alerts(data_origin,rule_id,token_id,triggered_at,reason,observed_data,sources,fingerprint,status)
 VALUES('DEMO',%L,%L,now(),'x','{}','[]','fixture-fingerprint','pending')$q$,rule,token_demo),'23505');
 PERFORM pg_temp.expect_error('suppression reason mandatory',format('UPDATE alerts SET suppression_reason=NULL WHERE id=%L',alert),'23514');
 PERFORM pg_temp.expect_error('DEMO external delivery rejected',format($q$
 INSERT INTO notification_deliveries(data_origin,alert_id,channel,destination_ref,status,idempotency_key)
 VALUES('DEMO',%L,'smtp','fixture','pending','external-1')$q$,alert),'23514');
 INSERT INTO outbox_messages(data_origin,task_type,subject_id,payload,idempotency_key)
 VALUES('DEMO','analyse',token_demo,'{}','job-1');
 PERFORM pg_temp.expect_error('outbox task deduplicated',format($q$
 INSERT INTO outbox_messages(data_origin,task_type,subject_id,payload,idempotency_key)
 VALUES('DEMO','analyse',%L,'{}','job-1')$q$,token_demo),'23505');
 SELECT updated_at INTO before_update FROM events WHERE id=event_demo;
 UPDATE events SET title='[DÉMO] Révision' WHERE id=event_demo;
 PERFORM pg_temp.assert_true('updated_at refreshed',(SELECT updated_at>before_update FROM events WHERE id=event_demo));
END $$;
SELECT count(*) AS passed_checks FROM test_results;
SELECT name AS passed FROM test_results ORDER BY name;
ROLLBACK;
