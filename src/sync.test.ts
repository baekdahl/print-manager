import { beforeEach, expect, test } from "vitest";
import { resetDatabase, testDb } from "../test/db";
import { stubVendor } from "../test/vendor";
import { printersTable } from "./db/schema";
import { syncPrinters } from "./sync";

beforeEach(resetDatabase);

test("vendor printer is inserted", async () => {
	await syncPrinters(
		stubVendor({ printers: [{ name: "printer", model: "brother" }] }),
	);

	const rows = await testDb.select().from(printersTable);

	expect(rows).toEqual([
		{
			name: "printer",
			model: "brother",
			location: null,
			nickname: null,
			serialNumber: null,
			deleted: false,
		},
	]);
});
