import { serve } from "@hono/node-server";
import { app } from "./app";
import { startPrintWorkerLoop } from "./print-worker-runner";
import { startSyncLoop, syncIntervalFromEnv } from "./sync-runner";
import { vendorFromEnv } from "./vendor";

// Local stand-ins for the AWS triggers: API Gateway → serve(), EventBridge → the sync
// loop, the SQS event source mapping → the print worker loop.
const vendor = vendorFromEnv();

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
	console.log(`API listening on http://localhost:${info.port}`);
});

startSyncLoop(vendor, syncIntervalFromEnv());
startPrintWorkerLoop(vendor);
