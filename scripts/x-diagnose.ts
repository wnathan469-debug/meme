import { diagnoseX } from "../apps/api/x-runtime.ts";
import { ProviderError } from "../packages/shared/errors.ts";
try {
  console.log(JSON.stringify(await diagnoseX(), null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      error instanceof ProviderError
        ? error.toJSON()
        : { code: "INVALID_INPUT", message: "Configuration X invalide." },
    ),
  );
  process.exitCode = 1;
}
