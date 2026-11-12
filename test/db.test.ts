import { beforeEach, expect, test } from "vitest";
import { printersTable } from "../src/db/schema";
import { resetDatabase, testDb } from "./db";

beforeEach(resetDatabase);

test("test database has the schema and is emptied between tests", async () => {
	await testDb.insert(printersTable).values({ name: "smoke", model: "test" });

	await resetDatabase();

	expect(await testDb.select().from(printersTable)).toEqual([]);
});
