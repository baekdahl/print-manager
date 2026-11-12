import { sync } from "../sync";
import { syncConfigFromEnv } from "../sync-runner";

const { vendor } = syncConfigFromEnv();

// Invoked by EventBridge Scheduler. Errors are thrown on purpose, so the invocation
// counts as failed and can be alarmed on.
export const handler = async () => ({ result: await sync(vendor) });
