import { boolean, pgTable, text } from "drizzle-orm/pg-core";

export const printersTable = pgTable("printers", {
	vendorName: text().primaryKey().notNull(),
	vendorModel: text().notNull(),
	nickname: text(),
	location: text(),
	serialNumber: text(),
	deleted: boolean().default(false),
});
