import { describe, expect, test } from "vitest";
import { type Fetch, HttpVendorClient, VendorError } from "./vendor";

function clientReturning(fetch: Fetch, timeoutMs?: number) {
	return new HttpVendorClient({
		baseUrl: "http://vendor.test",
		fetch,
		timeoutMs,
	});
}

const json =
	(body: unknown, status = 200) =>
	() =>
		Response.json(body, { status });

describe("HttpVendorClient", () => {
	test("returns the parsed printers", async () => {
		const client = clientReturning(json([{ name: "P1", model: "ZD420" }]));

		expect(await client.getPrinters()).toEqual([
			{ name: "P1", model: "ZD420" },
		]);
	});

	test("ignores fields we don't use", async () => {
		const client = clientReturning(
			json([{ id: "lbl_1", name: "shipping", version: "3", color: "red" }]),
		);

		expect(await client.getLabels()).toEqual([
			{ id: "lbl_1", name: "shipping", version: "3" },
		]);
	});

	test("rejects a non-2xx response", async () => {
		const client = clientReturning(json({ error: "boom" }, 500));

		await expect(client.getPrinters()).rejects.toThrow(
			new VendorError("vendor GET /Printers returned 500"),
		);
	});

	test("rejects a body with the wrong shape", async () => {
		const client = clientReturning(json([{ name: "P1" }]));

		await expect(client.getPrinters()).rejects.toThrow(/unexpected body/);
	});

	test("rejects a body that isn't JSON", async () => {
		const client = clientReturning(() => new Response("<html>oops</html>"));

		await expect(client.getPrinters()).rejects.toBeInstanceOf(VendorError);
	});

	test("rejects when the connection fails", async () => {
		const client = clientReturning(() => {
			throw new TypeError("fetch failed");
		});

		await expect(client.getPrinters()).rejects.toThrow(
			"vendor GET /Printers failed: fetch failed",
		);
	});

	test("rejects when the vendor doesn't answer in time", async () => {
		// A vendor that never responds, but stops waiting when the request is aborted.
		const hang: Fetch = (_url, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(init.signal?.reason),
				);
			});
		const client = clientReturning(hang, 10);

		await expect(client.getPrinters()).rejects.toThrow(
			"vendor GET /Printers failed: timed out after 10 ms",
		);
	});
});
