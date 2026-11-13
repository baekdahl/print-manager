import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { PrintJob } from "../db/schema";
import { problem, problemResponse } from "../http/problem";
import { findPrintJob, submitPrintJob } from "../print-jobs";

// --- API shapes -------------------------------------------------------------

const PrintJobSchema = z
	.object({
		id: z.uuid(),
		printerName: z.string().openapi({ example: "ZD420-HALL-B" }),
		labelId: z.string().openapi({ example: "lbl_123" }),
		status: z.enum(["queued", "success", "failed"]).openapi({
			description:
				"`success` means the vendor accepted the job, not that the label has printed",
		}),
		attempts: z.number().int(),
		lastError: z.string().nullable(),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
	})
	.openapi("PrintJob");

const PrintJobRequestSchema = z
	.strictObject({
		printerName: z.string().min(1),
		labelId: z.string().min(1),
	})
	.openapi("PrintJobRequest", {
		example: { printerName: "ZD420-HALL-B", labelId: "lbl_123" },
	});

const IdParamSchema = z.object({
	id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

function toPrintJob(row: PrintJob): z.infer<typeof PrintJobSchema> {
	return {
		...row,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

// --- Routes -----------------------------------------------------------------

const createPrintJob = createRoute({
	method: "post",
	path: "/",
	summary: "Submit a print job",
	description:
		"The job is queued and sent to the vendor in the background. Poll the `Location` to follow it.",
	request: {
		body: {
			required: true,
			content: { "application/json": { schema: PrintJobRequestSchema } },
		},
	},
	responses: {
		202: {
			description: "Queued",
			headers: z.object({ Location: z.string() }),
			content: { "application/json": { schema: PrintJobSchema } },
		},
		400: problemResponse("Invalid body"),
		422: problemResponse("The printer or label doesn't exist or was removed"),
		503: problemResponse("The job couldn't be queued; it's recorded as failed"),
	},
});

const getPrintJob = createRoute({
	method: "get",
	path: "/{id}",
	summary: "Get a print job",
	request: { params: IdParamSchema },
	responses: {
		200: {
			description: "The print job",
			content: { "application/json": { schema: PrintJobSchema } },
		},
		404: problemResponse("No such print job"),
	},
});

const app = new OpenAPIHono()
	.openapi(createPrintJob, async (c) => {
		const result = await submitPrintJob(c.req.valid("json"));
		switch (result.kind) {
			case "unknown":
				return problem(c, 422, { detail: result.detail });
			case "not-queued":
				return problem(c, 503, {
					detail: `Print job ${result.job.id} couldn't be queued`,
				});
			case "queued":
				return c.json(toPrintJob(result.job), 202, {
					Location: `/print-jobs/${result.job.id}`,
				});
		}
	})

	.openapi(getPrintJob, async (c) => {
		const { id } = c.req.valid("param");
		const row = z.uuid().safeParse(id).success
			? await findPrintJob(id)
			: undefined;
		if (!row) return problem(c, 404);
		return c.json(toPrintJob(row), 200);
	});

export default app;
