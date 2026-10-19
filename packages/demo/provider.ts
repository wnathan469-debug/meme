import { DemoXProvider } from "../connectors/x/demo";
import type { Clock } from "../shared/runtime";
import { scenarioDataset } from "./scenario";
/** Same XProvider interface, canonical invented dataset; never contains a transport. */
export function createScenarioProvider(clock: Clock) {
  return new DemoXProvider(clock, scenarioDataset);
}
