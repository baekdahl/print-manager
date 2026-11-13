import { asc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { resetDatabase, testDb } from "../test/db";
import { stubVendor } from "../test/vendor";
import { labelsTable, printersTable } from "./db/schema";
import { SYNC_LOCK_KEY, sync } from "./sync";
import { VendorError, type VendorPrinter } from "./vendor";

beforeEach(resetDatabase);

const printers = () =>
	testDb.select().from(printersTable).orderBy(asc(printersTable.name));
const labels = () =>
	testDb.select().from(labelsTable).orderBy(asc(labelsTable.id));

const syncPrinters = (vendorPrinters: VendorPrinter[]) =>
	sync(stubVendor({ printers: vendorPrinters }));

const printerRow = (name: string, model: string, overrides = {}) => ({
	name,
	model,
	nickname: null,
	location: null,
	serialNumber: null,
	deleted: false,
	...overrides,
});

describe("printers", () => {
	test("a new vendor printer is inserted", async () => {
		await syncPrinters([{ name: "P1", model: "ZD420" }]);

		expect(await printers()).toEqual([printerRow("P1", "ZD420")]);
	});

	test("a changed vendor field is updated", async () => {
		await syncPrinters([{ name: "P1", model: "ZD420" }]);
		await syncPrinters([{ name: "P1", model: "ZD421" }]);

		expect(await printers()).toEqual([printerRow("P1", "ZD421")]);
	});

	test("metadata survives a sync that changes vendor fields", async () => {
		await syncPrinters([{ name: "P1", model: "ZD420" }]);
		await testDb
			.update(printersTable)
			.set({ nickname: "Hall B left", location: "Hall B" })
			.where(eq(printersTable.name, "P1"));

		await syncPrinters([{ name: "P1", model: "ZD421" }]);

		expect(await printers()).toEqual([
			printerRow("P1", "ZD421", {
				nickname: "Hall B left",
				location: "Hall B",
			}),
		]);
	});

	test("a printer missing from the vendor is soft-deleted and keeps its metadata", async () => {
		await syncPrinters([
			{ name: "P1", model: "ZD420" },
			{ name: "P2", model: "ZD621" },
		]);
		await testDb
			.update(printersTable)
			.set({ nickname: "Dock" })
			.where(eq(printersTable.name, "P2"));

		await syncPrinters([{ name: "P1", model: "ZD420" }]);

		expect(await printers()).toEqual([
			printerRow("P1", "ZD420"),
			printerRow("P2", "ZD621", { nickname: "Dock", deleted: true }),
		]);
	});

	test("a soft-deleted printer that reappears is restored", async () => {
		await syncPrinters([{ name: "P1", model: "ZD420" }]);
		await testDb
			.update(printersTable)
			.set({ nickname: "Dock" })
			.where(eq(printersTable.name, "P1"));
		await syncPrinters([]);

		await syncPrinters([{ name: "P1", model: "ZD420" }]);

		expect(await printers()).toEqual([
			printerRow("P1", "ZD420", { nickname: "Dock" }),
		]);
	});

	test("an empty vendor list soft-deletes everything", async () => {
		await syncPrinters([
			{ name: "P1", model: "ZD420" },
			{ name: "P2", model: "ZD621" },
		]);

		await syncPrinters([]);

		expect(await printers()).toEqual([
			printerRow("P1", "ZD420", { deleted: true }),
			printerRow("P2", "ZD621", { deleted: true }),
		]);
	});

	test("syncing the same data twice gives the same result", async () => {
		const vendor = [
			{ name: "P1", model: "ZD420" },
			{ name: "P2", model: "ZD621" },
		];

		await syncPrinters(vendor);
		const once = await printers();
		await syncPrinters(vendor);

		expect(await printers()).toEqual(once);
	});

	test("a duplicate name in the vendor response doesn't break the sync", async () => {
		await syncPrinters([
			{ name: "P1", model: "ZD420" },
			{ name: "P1", model: "ZD421" },
		]);

		expect(await printers()).toEqual([printerRow("P1", "ZD421")]);
	});
});

const labelRow = (
	id: string,
	name: string,
	version: string,
	overrides = {},
) => ({
	id,
	name,
	version,
	nickname: null,
	isPrimary: false,
	deleted: false,
	...overrides,
});

const syncLabels = (
	vendorLabels: { id: string; name: string; version: string }[],
) => sync(stubVendor({ labels: vendorLabels }));

const makePrimary = (id: string) =>
	testDb
		.update(labelsTable)
		.set({ isPrimary: true })
		.where(eq(labelsTable.id, id));

describe("labels", () => {
	test("a new vendor label is inserted and isn't primary", async () => {
		await syncLabels([{ id: "L1", name: "shipping", version: "1" }]);

		expect(await labels()).toEqual([labelRow("L1", "shipping", "1")]);
	});

	test("a new version of a label doesn't take over as primary", async () => {
		await syncLabels([{ id: "L1", name: "shipping", version: "1" }]);
		await makePrimary("L1");

		await syncLabels([
			{ id: "L1", name: "shipping", version: "1" },
			{ id: "L2", name: "shipping", version: "2" },
		]);

		expect(await labels()).toEqual([
			labelRow("L1", "shipping", "1", { isPrimary: true }),
			labelRow("L2", "shipping", "2"),
		]);
	});

	test("a removed primary label is soft-deleted, stops being primary and keeps its nickname", async () => {
		await syncLabels([{ id: "L1", name: "shipping", version: "1" }]);
		await makePrimary("L1");
		await testDb
			.update(labelsTable)
			.set({ nickname: "Shipping" })
			.where(eq(labelsTable.id, "L1"));

		await syncLabels([]);

		expect(await labels()).toEqual([
			labelRow("L1", "shipping", "1", { nickname: "Shipping", deleted: true }),
		]);
	});

	test("a removed label that reappears comes back as not primary", async () => {
		await syncLabels([{ id: "L1", name: "shipping", version: "1" }]);
		await makePrimary("L1");
		await syncLabels([]);

		await syncLabels([{ id: "L1", name: "shipping", version: "1" }]);

		expect(await labels()).toEqual([labelRow("L1", "shipping", "1")]);
	});

	test("a primary label renamed at the vendor stops being primary", async () => {
		// Otherwise it could collide with the primary of its new name and fail every sync.
		await syncLabels([
			{ id: "L1", name: "shipping", version: "1" },
			{ id: "L2", name: "pallet", version: "1" },
		]);
		await makePrimary("L1");
		await makePrimary("L2");

		await syncLabels([
			{ id: "L1", name: "pallet", version: "2" },
			{ id: "L2", name: "pallet", version: "1" },
		]);

		expect(await labels()).toEqual([
			labelRow("L1", "pallet", "2"),
			labelRow("L2", "pallet", "1", { isPrimary: true }),
		]);
	});
});

describe("a sync run", () => {
	test("a vendor error leaves the database unchanged", async () => {
		await syncPrinters([{ name: "P1", model: "ZD420" }]);
		const failing = {
			...stubVendor(),
			getLabels: async () => {
				throw new VendorError("vendor GET /Labels returned 500");
			},
		};

		await expect(sync(failing)).rejects.toThrow("returned 500");

		expect(await printers()).toEqual([printerRow("P1", "ZD420")]);
	});

	test("is skipped while another run holds the lock", async () => {
		const result = await testDb.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(${SYNC_LOCK_KEY})`);
			return syncPrinters([{ name: "P1", model: "ZD420" }]);
		});

		expect(result).toBe("skipped");
		expect(await printers()).toEqual([]);
	});

	test("reports a completed run", async () => {
		expect(await syncPrinters([])).toBe("synced");
	});
});
