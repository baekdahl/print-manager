import { sql } from "drizzle-orm";
import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

// Vendor fields (name, model) are written only by sync.
// Metadata fields (nickname, location, serialNumber) are written only by the API.
export const printersTable = pgTable("printers", {
	name: text().primaryKey(),
	model: text().notNull(),
	nickname: text(),
	location: text(),
	serialNumber: text(),
	deleted: boolean().notNull().default(false),
});

// A label `name` has several versions, each with its own vendor `id`.
export const labelsTable = pgTable(
	"labels",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		version: text().notNull(),
		nickname: text(),
		isPrimary: boolean().notNull().default(false),
		deleted: boolean().notNull().default(false),
	},
	(table) => [
		// At most one primary version per label name among labels that aren't removed.
		uniqueIndex("labels_one_primary_per_name")
			.on(table.name)
			.where(sql`${table.isPrimary} and not ${table.deleted}`),
	],
);

export type Printer = typeof printersTable.$inferSelect;
export type Label = typeof labelsTable.$inferSelect;
