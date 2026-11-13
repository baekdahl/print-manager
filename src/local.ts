import { serve } from "@hono/node-server";
import { app } from "./app";
import { env } from "./env";
import { startPrintWorkerLoop } from "./print-worker-runner";
import { startSyncLoop } from "./sync-runner";
import { vendorFromEnv } from "./vendor";

// Local stand-ins for the AWS triggers: API Gateway → serve(), EventBridge → the sync
// loop, the SQS event source mapping → the print worker loop.
const vendor = vendorFromEnv();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	console.log(`API listening on http://localhost:${info.port}`);
});

startSyncLoop(vendor, env.SYNC_INTERVAL_MS);
startPrintWorkerLoop(vendor);
