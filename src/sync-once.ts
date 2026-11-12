import { db } from "./db";
import { sync } from "./sync";
import { syncConfigFromEnv } from "./sync-runner";

// `pnpm sync`: one run, then exit. A failed run exits non-zero.
try {
	console.log(`sync ${await sync(syncConfigFromEnv().vendor)}`);
} catch (error) {
	console.error(
		`sync failed: ${error instanceof Error ? error.message : error}`,
	);
	process.exitCode = 1;
} finally {
	await db.$client.end();
}
