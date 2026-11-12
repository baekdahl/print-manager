import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetDatabase } from "../test/db";
import { stubVendor } from "../test/vendor";
import { syncAndReport } from "./sync-runner";
import { VendorError } from "./vendor";

beforeEach(resetDatabase);
afterEach(() => {
	vi.restoreAllMocks();
});

test("a failed run is reported instead of thrown", async () => {
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	const failing = {
		...stubVendor(),
		getPrinters: async () => {
			throw new VendorError("vendor GET /Printers returned 500");
		},
	};

	await syncAndReport(failing);

	expect(log).toHaveBeenCalledWith(
		"sync failed: vendor GET /Printers returned 500",
	);
});

test("a successful run prints nothing", async () => {
	const log = vi.spyOn(console, "error").mockImplementation(() => {});

	await syncAndReport(stubVendor());

	expect(log).not.toHaveBeenCalled();
});
