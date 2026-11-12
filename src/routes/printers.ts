import { Hono } from "hono";
import { db } from "../db";
import z from "zod";
import { printersTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";

const app = new Hono();

const PrinterPatch = z.strictObject({
	nickname: z.string().optional(),
	location: z.string().optional(),
	serialNumber: z.string().optional(),
});

app.get("/", async (c) => {
	const printers = await db.select().from(printersTable);
	return c.json(printers);
});

app.get("/:name", async (c) => {
	const [printer] = await db
		.select()
		.from(printersTable)
		.where(eq(printersTable.vendorName, c.req.param("name")));

	return c.json(printer);
});

app.patch("/:name", zValidator("json", PrinterPatch), async (c) => {
	const patch = c.req.valid("json");
	const [printer] = await db
		.update(printersTable)
		.set(patch)
		.where(eq(printersTable.vendorName, c.req.param("name")))
		.returning();
	return c.json(printer);
});

export default app;
