import { loadXConfig } from "../packages/connectors/x/config";
import { createXWorker } from "../apps/worker/x-worker";
import { ProviderError } from "../packages/shared/errors";
try {
  const config = await loadXConfig(),
    args = process.argv.slice(2);
  if (
    args.some((arg) => !["--once", "--run", "--people"].includes(arg)) ||
    (args.includes("--once") && args.includes("--run"))
  )
    throw new ProviderError("INVALID_INPUT");
  if (
    !args.some((arg) => arg === "--once" || arg === "--run") ||
    config.collection.mode === "disabled"
  )
    process.stdout.write(
      JSON.stringify({
        collectionMode: config.collection.mode,
        dataOrigin: config.mode === "demo" ? "DEMO" : "REAL",
        status:
          config.collection.mode === "disabled"
            ? "Collecte désactivée"
            : "Diagnostic uniquement ; choisir --once ou --run",
        networkCalls: 0,
      }) + "\n",
    );
  else {
    const worker = await createXWorker(
      config,
      process.env.X_OWNER_USER_ID ?? "",
    );
    const controller = new AbortController();
    const stop = () => {
      controller.abort();
      worker.collector.stop();
      worker.peopleCollector.stop();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const collector = args.includes("--people")
      ? worker.peopleCollector
      : worker.collector;
    try {
      if (args.includes("--once")) {
        const result = await collector.tick();
        process.stdout.write(
          JSON.stringify({ result, status: worker.collector.status }) + "\n",
        );
      } else await collector.run(controller.signal);
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      await worker.close();
    }
  }
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      error instanceof ProviderError
        ? error.toJSON()
        : {
            code: "STORE_UNAVAILABLE",
            message: "Collecte suspendue ; détails de connexion masqués.",
          },
    ) + "\n",
  );
  process.exitCode = 1;
}
