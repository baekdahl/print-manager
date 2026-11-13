import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createFakeVendor } from "../fake-vendor/app";
import { resetDatabase } from "../test/db";
import { get, post } from "../test/http";
import { purgeQueue, queueCounts } from "../test/queue";
import { receiveOnce } from "./print-worker-runner";
import { printJobQueue, sqs } from "./queue";
import { sync } from "./sync";
import { HttpVendorClient } from "./vendor";

// The whole flow with real pieces: our API, the ElasticMQ queue, the worker loop, and the
// real HTTP vendor client talking to the fake vendor in-process.
let fakeVendor: ReturnType<typeof createFakeVendor>;
let vendor: HttpVendorClient;

beforeEach(async () => {
	await resetDatabase();
	await purgeQueue();
	fakeVendor = createFakeVendor();
	vendor = new HttpVendorClient({
		baseUrl: "http://vendor.test",
		fetch: (url, init) => fakeVendor.request(url, init),
	});
	await sync(vendor);
});
afterEach(() => {
	vi.restoreAllMocks();
});

const submit = async () =>
	(
		await post("/print-jobs", {
			printerName: "ZD420-HALL-B",
			labelId: "lbl_101",
		})
	).json();

const status = async (id: string) => (await get(`/print-jobs/${id}`)).json();

test("a submitted job reaches the vendor and the message is deleted", async () => {
	const { id } = await submit();

	await receiveOnce(vendor, 1);

	expect(await status(id)).toMatchObject({ status: "submitted", attempts: 1 });
	expect(await (await fakeVendor.request("/admin/prints")).json()).toEqual([
		{ printerName: "ZD420-HALL-B", labelId: "lbl_101" },
	]);
	expect(await queueCounts()).toEqual({ waiting: 0, inFlight: 0 });
});

test("a vendor 500 leaves the message on the queue, hidden until the backoff ends", async () => {
	await fakeVendor.request("/admin/print-faults", {
		method: "POST",
		body: JSON.stringify({ status: 500 }),
		headers: { "content-type": "application/json" },
	});
	const { id } = await submit();

	await receiveOnce(vendor, 1);

	expect(await status(id)).toMatchObject({
		status: "queued",
		attempts: 1,
		lastError: "vendor POST /Print returned 500",
	});
	expect(await queueCounts()).toEqual({ waiting: 0, inFlight: 1 });
});

test("a vendor 400 fails the job and deletes the message", async () => {
	const { id } = await submit();
	await fakeVendor.request("/admin/printers/ZD420-HALL-B", {
		method: "DELETE",
	});

	await receiveOnce(vendor, 1);

	expect(await status(id)).toMatchObject({
		status: "failed",
		lastError: "vendor POST /Print returned 400",
	});
	expect(await queueCounts()).toEqual({ waiting: 0, inFlight: 0 });
});

test("a malformed message is dropped", async () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	await sqs.send(
		new SendMessageCommand({ QueueUrl: printJobQueue.url, MessageBody: "{}" }),
	);

	await receiveOnce(vendor, 1);

	expect(await queueCounts()).toEqual({ waiting: 0, inFlight: 0 });
});
