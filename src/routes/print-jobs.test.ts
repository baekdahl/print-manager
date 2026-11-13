import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetDatabase, testDb } from "../../test/db";
import { get, post } from "../../test/http";
import { purgeQueue, takeMessages } from "../../test/queue";
import { stubVendor } from "../../test/vendor";
import { printJobsTable } from "../db/schema";
import { printJobQueue } from "../queue";
import { sync } from "../sync";

const vendorData = {
	printers: [
		{ name: "P1", model: "ZD420" },
		{ name: "P2", model: "ZD621" },
	],
	labels: [
		{ id: "lbl_1", name: "shipping", version: "1" },
		{ id: "lbl_2", name: "shipping", version: "2" },
	],
};

beforeEach(async () => {
	await resetDatabase();
	await purgeQueue();
	await sync(stubVendor(vendorData));
});
afterEach(() => {
	vi.restoreAllMocks();
});

const job = { printerName: "P1", labelId: "lbl_1" };

describe("POST /print-jobs", () => {
	test("queues the job and points to it", async () => {
		const res = await post("/print-jobs", job);

		expect(res.status).toBe(202);
		const body = await res.json();
		expect(body).toMatchObject({
			...job,
			status: "queued",
			attempts: 0,
			lastError: null,
		});
		expect(res.headers.get("location")).toBe(`/print-jobs/${body.id}`);
		expect(await takeMessages()).toEqual([{ jobId: body.id }]);
	});

	test("rejects an unknown printer with 422", async () => {
		const res = await post("/print-jobs", { ...job, printerName: "nope" });

		expect(res.status).toBe(422);
		expect(await res.json()).toMatchObject({
			detail: "No printer named nope",
		});
		expect(await takeMessages()).toEqual([]);
	});

	test("rejects a label removed at the vendor with 422", async () => {
		await sync(
			stubVendor({ ...vendorData, labels: vendorData.labels.slice(1) }),
		);

		const res = await post("/print-jobs", job);

		expect(res.status).toBe(422);
	});

	test.each([
		[{ printerName: "P1" }],
		[{ ...job, copies: 2 }],
		[{ printerName: "", labelId: "lbl_1" }],
	])("rejects an invalid body %j with 400", async (body) => {
		expect((await post("/print-jobs", body)).status).toBe(400);
	});

	test("records the job as failed and answers 503 when the queue is down", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(printJobQueue, "send").mockRejectedValue(new Error("down"));

		const res = await post("/print-jobs", job);

		expect(res.status).toBe(503);
		expect(await testDb.select().from(printJobsTable)).toMatchObject([
			{ ...job, status: "failed", lastError: "Could not be queued" },
		]);
	});
});

describe("GET /print-jobs/{id}", () => {
	test("returns the job", async () => {
		const created = await (await post("/print-jobs", job)).json();

		const res = await get(`/print-jobs/${created.id}`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(created);
	});

	test.each([
		["an unknown id", "00000000-0000-4000-8000-000000000000"],
		["an id that isn't a UUID", "nope"],
	])("returns 404 for %s", async (_, id) => {
		expect((await get(`/print-jobs/${id}`)).status).toBe(404);
	});
});
