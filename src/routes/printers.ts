import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { type Printer, printersTable } from "../db/schema";
import { problem, problemResponse } from "../http/problem";

// --- API shapes -------------------------------------------------------------

const PrinterSchema = z
	.object({
		name: z.string().openapi({ example: "ZD420-HALL-B" }),
		model: z.string().openapi({ example: "ZD420" }),
		metadata: z.object({
			nickname: z.string().nullable().openapi({ example: "Hall B left" }),
			location: z
				.string()
				.nullable()
				.openapi({ example: "Building 2, Hall B" }),
			serialNumber: z.string().nullable().openapi({ example: "52J193300123" }),
		}),
	})
	.openapi("Printer");

// Missing field: no change. null: clear it. Unknown field (including `model`): 400.
const PrinterMetadataPatchSchema = z
	.strictObject({
		nickname: z.string().nullable().optional(),
		location: z.string().nullable().optional(),
		serialNumber: z.string().nullable().optional(),
	})
	.openapi("PrinterMetadataPatch", {
		example: { nickname: "Hall B left", location: null },
	});

const NameParamSchema = z.object({
	name: z.string().openapi({
		param: { name: "name", in: "path" },
		description: "Printer name, URL-encoded",
		example: "ZD420-HALL-B",
	}),
});

function toPrinter(row: Printer): z.infer<typeof PrinterSchema> {
	return {
		name: row.name,
		model: row.model,
		metadata: {
			nickname: row.nickname,
			location: row.location,
			serialNumber: row.serialNumber,
		},
	};
}

// --- Queries ----------------------------------------------------------------

// Removed printers behave as if they don't exist.
const isPresent = (name: string) =>
	and(eq(printersTable.name, name), eq(printersTable.deleted, false));

async function findPrinter(name: string) {
	const [row] = await db.select().from(printersTable).where(isPresent(name));
	return row;
}

// --- Routes -----------------------------------------------------------------

const listPrinters = createRoute({
	method: "get",
	path: "/",
	summary: "List printers",
	responses: {
		200: {
			description: "Printers that exist at the vendor",
			content: { "application/json": { schema: z.array(PrinterSchema) } },
		},
	},
});

const getPrinter = createRoute({
	method: "get",
	path: "/{name}",
	summary: "Get a printer",
	request: { params: NameParamSchema },
	responses: {
		200: {
			description: "The printer",
			content: { "application/json": { schema: PrinterSchema } },
		},
		404: problemResponse("No such printer, or it was removed"),
	},
});

const updatePrinterMetadata = createRoute({
	method: "patch",
	path: "/{name}",
	summary: "Update a printer's metadata",
	request: {
		params: NameParamSchema,
		body: {
			required: true,
			content: { "application/json": { schema: PrinterMetadataPatchSchema } },
		},
	},
	responses: {
		200: {
			description: "The updated printer",
			content: { "application/json": { schema: PrinterSchema } },
		},
		400: problemResponse(
			"Invalid body, such as an unknown or vendor-owned field",
		),
		404: problemResponse("No such printer, or it was removed"),
	},
});

const app = new OpenAPIHono()
	.openapi(listPrinters, async (c) => {
		const rows = await db
			.select()
			.from(printersTable)
			.where(eq(printersTable.deleted, false))
			.orderBy(asc(printersTable.name));
		return c.json(rows.map(toPrinter), 200);
	})

	.openapi(getPrinter, async (c) => {
		const row = await findPrinter(c.req.valid("param").name);
		if (!row) return problem(c, 404);
		return c.json(toPrinter(row), 200);
	})

	.openapi(updatePrinterMetadata, async (c) => {
		const { name } = c.req.valid("param");
		const patch = c.req.valid("json");

		// An empty patch is valid and changes nothing (an empty UPDATE isn't valid SQL).
		const [row] =
			Object.keys(patch).length === 0
				? [await findPrinter(name)]
				: await db
						.update(printersTable)
						.set(patch)
						.where(isPresent(name))
						.returning();

		if (!row) return problem(c, 404);
		return c.json(toPrinter(row), 200);
	});

export default app;
