import { sql } from "drizzle-orm";
import { db } from "./db";
import { printersTable } from "./db/schema";
import { FakeVendorClient, type VendorClient } from "./vendor";

type NewPrinter = typeof printersTable.$inferInsert;

export async function syncPrinters(client: VendorClient) {
	const vendorPrinters = client.getPrinters();

	const currentPrinters = await db.select().from(printersTable);

	const joinedPrinters: NewPrinter[] = vendorPrinters.map((vendorPrinter) => {
		const printer = currentPrinters.find(
			(printer) => printer.name === vendorPrinter.name,
		);

		return {
			...printer,
			name: vendorPrinter.name,
			model: vendorPrinter.model,
		};
	});

	await db
		.insert(printersTable)
		.values(joinedPrinters)
		.onConflictDoUpdate({
			target: printersTable.name,
			set: {
				model: sql.raw(`excluded."${printersTable.model.name}"`),
			},
		});
}

if (import.meta.main) {
	await syncPrinters(new FakeVendorClient());
}

// Write one test per behaviour. You can derive them from ADR 0001:
// - A new vendor printer is inserted.
// - A changed vendor field is updated.
// - Metadata survives a sync that changes vendor fields (#3).
// - A printer missing from the vendor gets soft-deleted, and its metadata is kept (#6).
// - A soft-deleted printer that reappears is restored.
// - An empty vendor list soft-deletes everything (ADR 0002).
// - A vendor error leaves the database unchanged, once getPrinters is async and can fail.
// - Running sync twice with the same data gives the same result (idempotency).
