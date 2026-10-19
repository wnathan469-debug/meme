-- Applied explicitly by the migration operator, not at application startup.
GRANT USAGE ON SCHEMA memeradar TO memeradar_api;
GRANT SELECT ON memeradar.schema_migrations, memeradar.users,
 memeradar.tracked_people, memeradar.x_users, memeradar.person_categories,
 memeradar.x_posts, memeradar.x_post_collections, memeradar.x_collection_runs,
 memeradar.x_rules, memeradar.x_post_rules, memeradar.post_event_links,
 memeradar.event_watches, memeradar.post_token_mentions,
 memeradar.provider_controls, memeradar.provider_diagnostics,
 memeradar.x_usage_ledger, memeradar.provider_budgets,
 memeradar.server_provider_policies, memeradar.server_provider_usage
 TO memeradar_api;
GRANT SELECT, INSERT, UPDATE ON memeradar.sessions,
 memeradar.server_request_limits, memeradar.server_collection_controls
 TO memeradar_api;
-- Runtime has no INSERT/UPDATE privilege on users, posts or paid policies.
