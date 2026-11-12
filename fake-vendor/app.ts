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

	return new Hono()
		.get("/Printers", (c) => c.json([...printers.values()]))
		.get("/Labels", (c) => c.json([...labels.values()]))

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
		);
}
