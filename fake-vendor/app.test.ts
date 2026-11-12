import { describe, expect, test } from "vitest";
import { HttpVendorClient } from "../src/vendor";
import { createFakeVendor } from "./app";

// Contract test: the real HTTP client against the fake vendor, in-process.
// If the two disagree on paths or response shapes, this fails.
function setup() {
	const vendor = createFakeVendor({
		printers: [{ name: "P1", model: "ZD420" }],
		labels: [{ id: "lbl_1", name: "shipping", version: "1" }],
	});
	const client = new HttpVendorClient({
		baseUrl: "http://vendor.test",
		fetch: (url, init) => vendor.request(url, init),
	});
	return { vendor, client };
}

function post(path: string, body: unknown): [string, RequestInit] {
	return [
		path,
		{
			method: "POST",
			body: JSON.stringify(body),
			headers: { "content-type": "application/json" },
		},
	];
}

describe("fake vendor", () => {
	test("serves its printers and labels to the client", async () => {
		const { client } = setup();

		expect(await client.getPrinters()).toEqual([
			{ name: "P1", model: "ZD420" },
		]);
		expect(await client.getLabels()).toEqual([
			{ id: "lbl_1", name: "shipping", version: "1" },
		]);
	});

	test("admin endpoints add and remove printers", async () => {
		const { vendor, client } = setup();

		await vendor.request(
			...post("/admin/printers", { name: "P2", model: "ZD621" }),
		);
		const removed = await vendor.request("/admin/printers/P1", {
			method: "DELETE",
		});

		expect(removed.status).toBe(204);
		expect(await client.getPrinters()).toEqual([
			{ name: "P2", model: "ZD621" },
		]);
	});

	test("admin endpoints add and remove labels", async () => {
		const { vendor, client } = setup();

		await vendor.request(
			...post("/admin/labels", { id: "lbl_2", name: "shipping", version: "2" }),
		);
		await vendor.request("/admin/labels/lbl_1", { method: "DELETE" });

		expect(await client.getLabels()).toEqual([
			{ id: "lbl_2", name: "shipping", version: "2" },
		]);
	});

	test("removing something that doesn't exist is a 404", async () => {
		const { vendor } = setup();

		const res = await vendor.request("/admin/printers/nope", {
			method: "DELETE",
		});

		expect(res.status).toBe(404);
	});
});
