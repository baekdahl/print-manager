import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { testDatabaseName, testDatabaseUrl } from "./database-url";

export default async function setup() {
	const adminUrl = new URL(testDatabaseUrl);
	adminUrl.pathname = "/postgres";

	const admin = new Client({ connectionString: adminUrl.toString() });
	await admin.connect();
	try {
		await admin.query(
			`drop database if exists "${testDatabaseName}" with (force)`,
		);
		await admin.query(`create database "${testDatabaseName}"`);
	} finally {
		await admin.end();
	}

	// Apply the same migrations as dev and production, so tests run on the real schema.
	const db = drizzle(testDatabaseUrl);
	try {
		await migrate(db, { migrationsFolder: "./drizzle" });
	} finally {
		await db.$client.end();
	}
}
