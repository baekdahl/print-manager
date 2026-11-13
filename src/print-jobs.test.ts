import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetDatabase, testDb } from "../test/db";
import { stubVendor } from "../test/vendor";
import { printJobsTable } from "./db/schema";
import { MAX_ATTEMPTS, processPrintJob } from "./print-jobs";
import { sync } from "./sync";
import { VendorError } from "./vendor";

beforeEach(async () => {
	await resetDatabase();
	await sync(
		stubVendor({
			printers: [{ name: "P1", model: "ZD420" }],
			labels: [{ id: "lbl_1", name: "shipping", version: "1" }],
		}),
	);
});

async function insertJob(
	fields: Partial<typeof printJobsTable.$inferInsert> = {},
) {
	const [job] = await testDb
		.insert(printJobsTable)
		.values({ printerName: "P1", labelId: "lbl_1", ...fields })
		.returning();
	if (!job) throw new Error("no job");
	return job.id;
}

async function jobRow(id: string) {
	const [row] = await testDb
		.select()
		.from(printJobsTable)
		.where(eq(printJobsTable.id, id));
	return row;
}

const vendorFailing = (error: Error) =>
	stubVendor({
		print: async () => {
			throw error;
		},
	});

describe("processPrintJob", () => {
	test("marks the job submitted when the vendor accepts it", async () => {
		const print = vi.fn(async () => {});
		const id = await insertJob();

		const result = await processPrintJob(id, stubVendor({ print }));

		expect(result).toEqual({ kind: "done" });
		expect(print).toHaveBeenCalledWith({ printerName: "P1", labelId: "lbl_1" });
		expect(await jobRow(id)).toMatchObject({
			status: "submitted",
			attempts: 1,
			lastError: null,
		});
	});

	test("keeps the job queued and asks for a retry on a retryable error", async () => {
		const id = await insertJob();

		const result = await processPrintJob(
			id,
			vendorFailing(new VendorError("returned 500", { retryable: true })),
		);

		expect(result).toEqual({ kind: "retry", delaySeconds: 10 });
		expect(await jobRow(id)).toMatchObject({
			status: "queued",
			attempts: 1,
			lastError: "returned 500",
		});
	});

	test("backs off exponentially", async () => {
		const id = await insertJob({ attempts: 2 });

		const result = await processPrintJob(
			id,
			vendorFailing(new VendorError("returned 500", { retryable: true })),
		);

		expect(result).toEqual({ kind: "retry", delaySeconds: 40 });
	});

	test("fails the job when retries run out", async () => {
		const id = await insertJob({ attempts: MAX_ATTEMPTS - 1 });

		const result = await processPrintJob(
			id,
			vendorFailing(new VendorError("returned 500", { retryable: true })),
		);

		expect(result).toEqual({ kind: "done" });
		expect(await jobRow(id)).toMatchObject({
			status: "failed",
			attempts: MAX_ATTEMPTS,
			lastError: `returned 500 (gave up after ${MAX_ATTEMPTS} attempts)`,
		});
	});

	test("fails the job straight away on a final error", async () => {
		const id = await insertJob();

		const result = await processPrintJob(
			id,
			vendorFailing(new VendorError("returned 400")),
		);

		expect(result).toEqual({ kind: "done" });
		expect(await jobRow(id)).toMatchObject({
			status: "failed",
			attempts: 1,
			lastError: "returned 400",
		});
	});

	test("ignores a job that is no longer queued, so a duplicate message can't print twice", async () => {
		const print = vi.fn(async () => {});
		const id = await insertJob({ status: "submitted", attempts: 1 });

		expect(await processPrintJob(id, stubVendor({ print }))).toEqual({
			kind: "done",
		});
		expect(print).not.toHaveBeenCalled();
	});

	test("skips a job another worker is sending right now", async () => {
		const print = vi.fn(async () => {});
		const id = await insertJob();

		await testDb.transaction(async (tx) => {
			await tx
				.select()
				.from(printJobsTable)
				.where(eq(printJobsTable.id, id))
				.for("update");

			expect(await processPrintJob(id, stubVendor({ print }))).toEqual({
				kind: "done",
			});
		});
		expect(print).not.toHaveBeenCalled();
	});

	test("an unexpected error changes nothing and is thrown", async () => {
		const id = await insertJob();

		await expect(
			processPrintJob(id, vendorFailing(new Error("bug"))),
		).rejects.toThrow("bug");
		expect(await jobRow(id)).toMatchObject({ status: "queued", attempts: 0 });
	});
});
