import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

// Stands in for the third-party vendor: its read endpoints, plus admin endpoints that
// play the part of the other team adding and removing printers and labels.

const PrinterSchema = z.object({
	name: z.string().min(1),
	model: z.string().min(1),
});
const LabelSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	version: z.string().min(1),
});

const PrintSchema = z.object({ printerName: z.string(), labelId: z.string() });

// What the next calls to POST /Print do instead of succeeding, one entry per call.
const FaultSchema = z.object({
	status: z.union([z.literal(400), z.literal(500)]).optional(),
	delayMs: z.number().int().positive().optional(),
	times: z.number().int().positive().default(1),
});

type Printer = z.infer<typeof PrinterSchema>;
type Label = z.infer<typeof LabelSchema>;

export const defaultSeed: { printers: Printer[]; labels: Label[] } = {
	printers: [
		{ name: "ZD420-HALL-B", model: "ZD420" },
		{ name: "ZD621-DOCK-1", model: "ZD621" },
		{ name: "GK420-OFFICE", model: "GK420" },
	],
	labels: [
		{ id: "lbl_101", name: "shipping-4x6", version: "1" },
		{ id: "lbl_102", name: "shipping-4x6", version: "2" },
		{ id: "lbl_201", name: "pallet-tag", version: "1" },
	],
};

export function createFakeVendor(seed = defaultSeed) {
	// Maps keyed by the vendor's identifiers, so adding an existing key replaces it.
	const printers = new Map(seed.printers.map((p) => [p.name, p]));
	const labels = new Map(seed.labels.map((l) => [l.id, l]));
	const prints: z.infer<typeof PrintSchema>[] = [];
	let faults: Omit<z.infer<typeof FaultSchema>, "times">[] = [];

	return (
		new Hono()
			.get("/Printers", (c) => c.json([...printers.values()]))
			.get("/Labels", (c) => c.json([...labels.values()]))

			// Like the real vendor, a 400 carries no reason.
			.post("/Print", async (c) => {
				const fault = faults.shift();
				if (fault?.delayMs) {
					await new Promise((resolve) => setTimeout(resolve, fault.delayMs));
				}
				if (fault?.status) return c.body(null, fault.status);

				const job = PrintSchema.safeParse(await c.req.json().catch(() => null));
				if (
					!job.success ||
					!printers.has(job.data.printerName) ||
					!labels.has(job.data.labelId)
				) {
					return c.body(null, 400);
				}
				prints.push(job.data);
				return c.body(null, 201);
			})

			.get("/admin/prints", (c) => c.json(prints))
			.post("/admin/print-faults", zValidator("json", FaultSchema), (c) => {
				const { times, ...fault } = c.req.valid("json");
				faults.push(...Array.from({ length: times }, () => fault));
				return c.json(faults, 201);
			})
			.delete("/admin/print-faults", (c) => {
				faults = [];
				return c.body(null, 204);
			})

			.post("/admin/printers", zValidator("json", PrinterSchema), (c) => {
				const printer = c.req.valid("json");
				printers.set(printer.name, printer);
				return c.json(printer, 201);
			})
			.delete("/admin/printers/:name", (c) =>
				printers.delete(c.req.param("name")) ? c.body(null, 204) : c.notFound(),
			)
			.post("/admin/labels", zValidator("json", LabelSchema), (c) => {
				const label = c.req.valid("json");
				labels.set(label.id, label);
				return c.json(label, 201);
			})
			.delete("/admin/labels/:id", (c) =>
				labels.delete(c.req.param("id")) ? c.body(null, 204) : c.notFound(),
			)
	);
}
