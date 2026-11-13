import "dotenv/config";
import { z } from "zod";
import { sync } from "./sync";
import type { VendorClient } from "./vendor";

export function syncIntervalFromEnv() {
	return z.coerce
		.number()
		.int()
		.positive()
		.default(60_000)
		.parse(process.env.SYNC_INTERVAL_MS);
}

// For long-running processes: a failed run is reported, and the next run tries again.
export async function syncAndReport(vendor: VendorClient) {
	try {
		if ((await sync(vendor)) === "skipped") {
			console.error("sync skipped: another run is in progress");
		}
	} catch (error) {
		console.error(
			`sync failed: ${error instanceof Error ? error.message : error}`,
		);
	}
}

// Runs now, then again `intervalMs` after each run finishes, so runs never overlap
// within this process. The advisory lock covers other processes.
export function startSyncLoop(vendor: VendorClient, intervalMs: number) {
	let timer: NodeJS.Timeout | undefined;
	const loop = async () => {
		await syncAndReport(vendor);
		timer = setTimeout(loop, intervalMs);
	};
	void loop();
	return () => clearTimeout(timer);
}
