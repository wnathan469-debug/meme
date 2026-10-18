import { PgSocialRepository } from "../../packages/db/social-repository";
import { PgEventRepository } from "../../packages/db/event-repository";
import { PgConversationRepository } from "../../packages/db/conversation-repository";
import { ConversationService } from "../../packages/conversations/service";
import { PgPeopleRepository } from "../../packages/db/people-repository";
import { PeopleService } from "../../packages/people/service";
import { PeopleCollector } from "../../packages/people/collector";
/** Private operator composition; no HTTP listener or implicit paid startup. */
import pg from "pg";
import type { XConfig } from "../../packages/connectors/x/config";
import { createXRuntime } from "../api/x-runtime";
import { PgXCollectionRepository } from "../../packages/db/x-collection-repository";
import { XCollector } from "../../packages/collection/collector";
import { XSearchService } from "../../packages/collection/search-service";
import { FeedHub } from "../../packages/collection/feed";
import { ProviderError } from "../../packages/shared/errors";
export async function createXWorker(config: XConfig, ownerId: string) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      ownerId,
    )
  )
    throw new ProviderError("INVALID_INPUT");
  if (!config.databaseUrl) throw new ProviderError("NOT_CONFIGURED");
  if (
    config.collection.leaseMs <=
    config.streaming.windowMs + config.timeoutMs + 1000
  )
    throw new ProviderError("INVALID_INPUT");
  const runtime = await createXRuntime({
    ...config,
    streaming: {
      ...config.streaming,
      tagPrefix: config.streaming.tagPrefix + ownerId + ":",
    },
  });
  if (!runtime.provider) {
    await runtime.close();
    throw new ProviderError("NOT_CONFIGURED");
  }
  const pool = new pg.Pool({
    connectionString: config.databaseUrl.reveal(),
    max: 12,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  pool.on("error", () => {});
  const hub = new FeedHub(),
    repository = new PgXCollectionRepository(
      pool,
      ownerId,
      runtime.provider.dataOrigin,
      hub,
    );
  const collector = new XCollector(runtime.provider, repository, {
    ...config.collection,
    maxResults: config.maxResults,
    streamLockKey: config.namespace,
  });
  const peopleRepository = new PgPeopleRepository(
    pool,
    ownerId,
    runtime.provider.dataOrigin,
  );
  const peopleCollector = new PeopleCollector(
    runtime.provider,
    peopleRepository,
    repository,
    { ...config.collection, maxResults: config.maxResults },
  );
  return {
    social: new PgSocialRepository(pool, ownerId, runtime.provider.dataOrigin),
    events: new PgEventRepository(pool, ownerId, runtime.provider.dataOrigin),
    conversations: new ConversationService(
      runtime.provider,
      new PgConversationRepository(
        pool,
        ownerId,
        runtime.provider.dataOrigin,
        repository,
      ),
      config,
    ),
    peopleDetails: (id: string) => peopleRepository.detail(id),
    people: new PeopleService(peopleRepository, runtime.provider),
    peopleCollector,
    collector,
    repository,
    hub,
    search: new XSearchService(runtime.provider, repository, config),
    async close() {
      collector.stop();
      peopleCollector.stop();
      await runtime.close();
      await pool.end();
    },
  };
}
