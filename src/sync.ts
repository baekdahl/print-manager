import { and, eq, notInArray, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "./db";
import { labelsTable, printersTable } from "./db/schema";
import type { VendorClient, VendorLabel, VendorPrinter } from "./vendor";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Makes our printers and labels match the vendor's, in one transaction.
 *
 * Throws (and changes nothing) if the vendor can't be read.
 */
export async function sync(vendor: VendorClient): Promise<void> {
	// Read the vendor before opening a transaction: if either call fails we never touch
	// the database, and a slow vendor doesn't keep a transaction open.
	const [printers, labels] = await Promise.all([
		vendor.getPrinters(),
		vendor.getLabels(),
	]);

	await db.transaction(async (tx) => {
		await syncPrinters(
			tx,
			uniqueBy(printers, (p) => p.name),
		);
		await syncLabels(
			tx,
			uniqueBy(labels, (l) => l.id),
		);
	});
}

async function syncPrinters(tx: Transaction, printers: VendorPrinter[]) {
	if (printers.length > 0) {
		await tx
			.insert(printersTable)
			.values(printers.map(({ name, model }) => ({ name, model })))
			.onConflictDoUpdate({
				target: printersTable.name,
				// Only vendor fields are overwritten, so our metadata survives.
				set: { model: excluded(printersTable.model), deleted: false },
			});
	}

	// Whatever the vendor no longer returns is soft-deleted. With an empty list,
	// notInArray matches every row.
	await tx
		.update(printersTable)
		.set({ deleted: true })
		.where(
			and(
				eq(printersTable.deleted, false),
				notInArray(
					printersTable.name,
					printers.map((p) => p.name),
				),
			),
		);
}

async function syncLabels(tx: Transaction, labels: VendorLabel[]) {
	if (labels.length > 0) {
		await tx
			.insert(labelsTable)
			.values(labels.map(({ id, name, version }) => ({ id, name, version })))
			.onConflictDoUpdate({
				target: labelsTable.id,
				set: {
					name: excluded(labelsTable.name),
					version: excluded(labelsTable.version),
					deleted: false,
					// A label that moved to another name can't stay primary: it would collide
					// with that name's primary on the unique index and fail every sync.
					isPrimary: sql`${labelsTable.isPrimary} and ${labelsTable.name} = ${excluded(labelsTable.name)}`,
				},
			});
	}

	// A removed label stops being primary, so it comes back as not primary.
	await tx
		.update(labelsTable)
		.set({ deleted: true, isPrimary: false })
		.where(
			and(
				eq(labelsTable.deleted, false),
				notInArray(
					labelsTable.id,
					labels.map((l) => l.id),
				),
			),
		);
}

// In ON CONFLICT DO UPDATE, `excluded` is the row we tried to insert.
function excluded(column: PgColumn) {
	return sql`excluded.${sql.identifier(column.name)}`;
}

// Postgres rejects an upsert that touches the same row twice, so drop duplicate keys
// (keeping the last one) rather than let one bad vendor response fail the whole sync.
function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
	return [...new Map(items.map((item) => [key(item), item])).values()];
}
