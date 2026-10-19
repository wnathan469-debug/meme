-- Run only AFTER restoring into an isolated, non-public recovery database.
-- An owner/superuser is required to ensure RLS cannot hide any origin.
BEGIN;
SET LOCAL row_security = off;
INSERT INTO memeradar.server_collection_controls(data_origin, stopped)
VALUES ('REAL', true), ('DEMO', true)
ON CONFLICT(data_origin) DO UPDATE SET stopped = true;
UPDATE memeradar.server_provider_policies
SET enabled = false, verified_at = NULL;
UPDATE memeradar.provider_controls SET enabled = false;
UPDATE memeradar.sessions SET revoked_at = now() WHERE revoked_at IS NULL;
-- Keep all provider_usage, budgets and ledgers for billing reconciliation.
COMMIT;
