import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { testDatabaseUrl } from "./database-url";

export const testDb = drizzle(testDatabaseUrl);

export async function resetDatabase() {
	const { rows } = await testDb.execute<{ tablename: string }>(
		sql`select tablename from pg_tables where schemaname = 'public'`,
	);
	if (rows.length === 0) return;

	const tables = rows.map((row) => `"${row.tablename}"`).join(", ");
	await testDb.execute(sql.raw(`truncate ${tables} restart identity cascade`));
}
