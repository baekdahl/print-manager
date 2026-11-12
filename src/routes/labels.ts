import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { type Label, labelsTable } from "../db/schema";
import { problem, problemResponse } from "../http/problem";

// --- API shapes -------------------------------------------------------------

const LabelSchema = z
	.object({
		id: z.string().openapi({ example: "lbl_123" }),
		name: z.string().openapi({ example: "shipping-4x6" }),
		version: z.string().openapi({ example: "3" }),
		metadata: z.object({
			nickname: z.string().nullable().openapi({ example: "Shipping" }),
			isPrimary: z.boolean().openapi({
				description: "At most one label per name is primary",
			}),
		}),
	})
	.openapi("Label");

// isPrimary always has a value, so unlike nickname it can't be cleared with null.
const LabelMetadataPatchSchema = z
	.strictObject({
		nickname: z.string().nullable().optional(),
		isPrimary: z.boolean().optional(),
	})
	.openapi("LabelMetadataPatch", { example: { isPrimary: true } });

const IdParamSchema = z.object({
	id: z.string().openapi({
		param: { name: "id", in: "path" },
		example: "lbl_123",
	}),
});

function toLabel(row: Label): z.infer<typeof LabelSchema> {
	return {
		id: row.id,
		name: row.name,
		version: row.version,
		metadata: { nickname: row.nickname, isPrimary: row.isPrimary },
	};
}

// --- Queries ----------------------------------------------------------------

const isPresent = (id: string) =>
	and(eq(labelsTable.id, id), eq(labelsTable.deleted, false));

type LabelPatch = z.infer<typeof LabelMetadataPatchSchema>;

async function updateLabelMetadata(id: string, patch: LabelPatch) {
	return db.transaction(async (tx) => {
		const [label] = await tx.select().from(labelsTable).where(isPresent(id));
		if (!label) return undefined;

		// Making this label primary demotes the other versions with the same name, in the
		// same transaction, so nobody sees zero or two primaries.
		if (patch.isPrimary) {
			await tx
				.update(labelsTable)
				.set({ isPrimary: false })
				.where(
					and(
						eq(labelsTable.name, label.name),
						ne(labelsTable.id, id),
						eq(labelsTable.isPrimary, true),
					),
				);
		}

		if (Object.keys(patch).length === 0) return label;
		const [updated] = await tx
			.update(labelsTable)
			.set(patch)
			.where(eq(labelsTable.id, id))
			.returning();
		return updated;
	});
}

// --- Routes -----------------------------------------------------------------

const listLabels = createRoute({
	method: "get",
	path: "/",
	summary: "List labels",
	responses: {
		200: {
			description: "Labels that exist at the vendor",
			content: { "application/json": { schema: z.array(LabelSchema) } },
		},
	},
});

const getLabel = createRoute({
	method: "get",
	path: "/{id}",
	summary: "Get a label",
	request: { params: IdParamSchema },
	responses: {
		200: {
			description: "The label",
			content: { "application/json": { schema: LabelSchema } },
		},
		404: problemResponse("No such label, or it was removed"),
	},
});

const patchLabel = createRoute({
	method: "patch",
	path: "/{id}",
	summary: "Update a label's metadata",
	description:
		"Setting `isPrimary: true` clears it on the other labels with the same name.",
	request: {
		params: IdParamSchema,
		body: {
			required: true,
			content: { "application/json": { schema: LabelMetadataPatchSchema } },
		},
	},
	responses: {
		200: {
			description: "The updated label",
			content: { "application/json": { schema: LabelSchema } },
		},
		400: problemResponse(
			"Invalid body, such as an unknown or vendor-owned field",
		),
		404: problemResponse("No such label, or it was removed"),
	},
});

const app = new OpenAPIHono()
	.openapi(listLabels, async (c) => {
		const rows = await db
			.select()
			.from(labelsTable)
			.where(eq(labelsTable.deleted, false))
			.orderBy(asc(labelsTable.name), asc(labelsTable.id));
		return c.json(rows.map(toLabel), 200);
	})

	.openapi(getLabel, async (c) => {
		const [row] = await db
			.select()
			.from(labelsTable)
			.where(isPresent(c.req.valid("param").id));
		if (!row) return problem(c, 404);
		return c.json(toLabel(row), 200);
	})

	.openapi(patchLabel, async (c) => {
		const row = await updateLabelMetadata(
			c.req.valid("param").id,
			c.req.valid("json"),
		);
		if (!row) return problem(c, 404);
		return c.json(toLabel(row), 200);
	});

export default app;
