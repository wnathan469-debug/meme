-- Additive collector state and fencing. No existing migration is changed.
BEGIN;
SET LOCAL search_path=memeradar,public;
ALTER TABLE x_collection_checkpoints ADD COLUMN lease_id uuid,
 ADD COLUMN pending_since_id text, ADD COLUMN query_hash text,
 ADD COLUMN next_due_at timestamptz NOT NULL DEFAULT now(),
 ADD CONSTRAINT x_checkpoint_pending_shape CHECK(pending_since_id IS NULL OR (data_origin='REAL' AND pending_since_id ~ '^[1-9][0-9]{0,31}$') OR (data_origin='DEMO' AND pending_since_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$'));
ALTER TABLE x_collection_runs ADD COLUMN partial boolean NOT NULL DEFAULT false, ADD COLUMN gap_started_at timestamptz, ADD COLUMN gap_ended_at timestamptz,
 ADD CONSTRAINT x_collection_gap_times CHECK(gap_ended_at IS NULL OR (gap_started_at IS NOT NULL AND gap_ended_at>=gap_started_at));
ALTER TABLE x_posts ADD COLUMN unresolved_author_x_user_id text CHECK(unresolved_author_x_user_id IS NULL OR (data_origin='REAL' AND unresolved_author_x_user_id ~ '^[1-9][0-9]{0,31}$') OR (data_origin='DEMO' AND unresolved_author_x_user_id ~ '^DEMO_[a-zA-Z0-9_]{1,80}$')), ADD COLUMN text_fingerprint text CHECK(text_fingerprint IS NULL OR text_fingerprint ~ '^[a-f0-9]{64}$');
CREATE INDEX x_posts_fingerprint_idx ON x_posts(data_origin,text_fingerprint);
CREATE INDEX x_checkpoint_due_idx ON x_collection_checkpoints(data_origin,next_due_at);
COMMIT;
