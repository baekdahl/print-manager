import { sync } from "./sync";
import type { VendorClient } from "./vendor";

// For long-running processes: a failed run is reported, and the next run tries again.
export async function syncAndReport(vendor: VendorClient) {
	try {
		await sync(vendor);
	} catch (error) {
		console.error(
			`sync failed: ${error instanceof Error ? error.message : error}`,
		);
	}
}

// Runs now, then again `intervalMs` after each run finishes, so runs never overlap.
export function startSyncLoop(vendor: VendorClient, intervalMs: number) {
	let timer: NodeJS.Timeout | undefined;
	const loop = async () => {
		await syncAndReport(vendor);
		timer = setTimeout(loop, intervalMs);
	};
	void loop();
	return () => clearTimeout(timer);
}
