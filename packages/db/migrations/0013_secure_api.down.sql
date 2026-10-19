BEGIN;
SET LOCAL search_path=memeradar,public;
SET LOCAL row_security=off;
DO $body$
DECLARE t text; occupied boolean;
BEGIN
 FOREACH t IN ARRAY ARRAY['server_collection_controls','server_provider_policies','server_provider_usage','server_request_limits'] LOOP
  EXECUTE format('LOCK TABLE %I IN ACCESS EXCLUSIVE MODE',t);
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I)',t) INTO occupied;
  IF occupied THEN RAISE EXCEPTION 'Secure API data would be lost'; END IF;
 END LOOP;
END $body$;
DROP TABLE server_request_limits,server_provider_usage,server_provider_policies,server_collection_controls;
COMMIT;
