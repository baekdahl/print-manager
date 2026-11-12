import { serve } from "@hono/node-server";
import { app } from "./app";
import { startSyncLoop, syncConfigFromEnv } from "./sync-runner";

// Local stand-in for the AWS triggers: API Gateway → serve(), EventBridge → the sync loop.
const { vendor, intervalMs } = syncConfigFromEnv();

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
	console.log(`API listening on http://localhost:${info.port}`);
});

startSyncLoop(vendor, intervalMs);
