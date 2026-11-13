import { createServer } from "node:net";
import { describe, expect, test } from "vitest";
import { type Fetch, HttpVendorClient, VendorError } from "./vendor";

function clientReturning(fetch: Fetch, timeoutMs?: number) {
	return new HttpVendorClient({
		baseUrl: "http://vendor.test",
		fetch,
		timeoutMs,
	});
}

// A port that was free a moment ago, so connecting to it is a real ECONNREFUSED.
async function unusedPort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as { port: number };
	await new Promise((resolve) => server.close(resolve));
	return port;
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
			new VendorError("vendor GET /Printers returned 500", { retryable: true }),
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

	describe("print", () => {
		const print = (client: HttpVendorClient) =>
			client.print({ printerName: "P1", labelId: "lbl_1" });

		test("sends the job and resolves on 201", async () => {
			let sent: unknown;
			const client = clientReturning(async (url, init) => {
				sent = { url, method: init?.method, body: init?.body };
				return new Response(null, { status: 201 });
			});

			await print(client);

			expect(sent).toEqual({
				url: "http://vendor.test/Print",
				method: "POST",
				body: JSON.stringify({ printerName: "P1", labelId: "lbl_1" }),
			});
		});

		test("a 500 is retryable: nothing printed", async () => {
			await expect(print(clientReturning(json({}, 500)))).rejects.toMatchObject(
				{ message: "vendor POST /Print returned 500", retryable: true },
			);
		});

		test("a 400 is final: retrying won't help", async () => {
			await expect(print(clientReturning(json({}, 400)))).rejects.toMatchObject(
				{ message: "vendor POST /Print returned 400", retryable: false },
			);
		});

		test("a refused connection is retryable: the request never left", async () => {
			const client = new HttpVendorClient({
				baseUrl: `http://127.0.0.1:${await unusedPort()}`,
			});

			await expect(print(client)).rejects.toMatchObject({
				message: "vendor POST /Print failed: ECONNREFUSED",
				retryable: true,
			});
		});

		test("a response timeout is final: the vendor may have printed", async () => {
			const hang: Fetch = (_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(init.signal?.reason),
					);
				});

			await expect(print(clientReturning(hang, 10))).rejects.toMatchObject({
				message: "vendor POST /Print failed: timed out after 10 ms",
				retryable: false,
			});
		});

		test("any other network error is final", async () => {
			const reset = () => {
				throw new TypeError("fetch failed", {
					cause: Object.assign(new Error("socket hang up"), {
						code: "ECONNRESET",
					}),
				});
			};

			await expect(print(clientReturning(reset))).rejects.toMatchObject({
				retryable: false,
			});
		});
	});
});
