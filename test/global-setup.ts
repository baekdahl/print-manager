import { execFileSync } from "node:child_process";
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

	execFileSync("pnpm", ["drizzle-kit", "push", "--force"], {
		env: { ...process.env, DATABASE_URL: testDatabaseUrl },
		stdio: "pipe",
	});
}
