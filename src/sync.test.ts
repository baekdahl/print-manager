import { beforeEach, expect, test } from "vitest";
import { FakeVendorClient } from "./vendor";
import { syncPrinters } from "./sync";
import { resetDatabase, testDb } from "../test/db";
import { printersTable } from "./db/schema";

beforeEach(resetDatabase);

test("vendor printer is inserted", async () => {
	await syncPrinters({
		getPrinters: () => [
			{
				name: "printer",
				model: "brother",
			},
		],
	});

	const rows = await testDb.select().from(printersTable);

	expect(rows).toEqual([
		{
			vendorName: "printer",
			vendorModel: "brother",
			location: null,
			nickname: null,
			serialNumber: null,
			deleted: false,
		},
	]);
});
