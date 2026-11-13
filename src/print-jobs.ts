import { and, eq } from "drizzle-orm";
import { db } from "./db";
import {
	labelsTable,
	type PrintJob,
	printersTable,
	printJobsTable,
} from "./db/schema";
import { printJobQueue } from "./queue";
import { type VendorClient, VendorError } from "./vendor";

export const MAX_ATTEMPTS = 5;

// 10 s, 20 s, 40 s, 80 s between the five attempts.
export function backoffSeconds(attempts: number) {
	return Math.min(10 * 2 ** (attempts - 1), 15 * 60);
}

export type SubmitResult =
	| { kind: "queued"; job: PrintJob }
	| { kind: "unknown"; detail: string }
	| { kind: "not-queued"; job: PrintJob };

/**
 * Stores a print job and puts it on the queue. The vendor is called later, by the worker.
 */
export async function submitPrintJob(request: {
	printerName: string;
	labelId: string;
}): Promise<SubmitResult> {
	const [printer] = await db
		.select()
		.from(printersTable)
		.where(
			and(
				eq(printersTable.name, request.printerName),
				eq(printersTable.deleted, false),
			),
		);
	if (!printer) {
		return {
			kind: "unknown",
			detail: `No printer named ${request.printerName}`,
		};
	}

	const [label] = await db
		.select()
		.from(labelsTable)
		.where(
			and(eq(labelsTable.id, request.labelId), eq(labelsTable.deleted, false)),
		);
	if (!label) {
		return { kind: "unknown", detail: `No label with id ${request.labelId}` };
	}

	// Insert first, so the worker always finds the job when the message arrives.
	const [job] = await db.insert(printJobsTable).values(request).returning();
	if (!job) throw new Error("insert returned no row");

	try {
		await printJobQueue.send({ jobId: job.id });
		return { kind: "queued", job };
	} catch (error) {
		console.error(`could not queue print job ${job.id}:`, error);
		const [failed] = await db
			.update(printJobsTable)
			.set({ status: "failed", lastError: "Could not be queued" })
			.where(eq(printJobsTable.id, job.id))
			.returning();
		return { kind: "not-queued", job: failed ?? job };
	}
}

export async function findPrintJob(id: string) {
	const [job] = await db
		.select()
		.from(printJobsTable)
		.where(eq(printJobsTable.id, id));
	return job;
}

export type ProcessResult =
	| { kind: "done" }
	| { kind: "retry"; delaySeconds: number };

/**
 * Sends one queued job to the vendor and records the outcome.
 *
 * Returns "retry" when the vendor failed in a way that's safe to retry and attempts are
 * left. The caller decides how to wait; for SQS that's the message's visibility timeout.
 */
export async function processPrintJob(
	jobId: string,
	vendor: VendorClient,
): Promise<ProcessResult> {
	return db.transaction(async (tx) => {
		// SQS can deliver a message twice. The row lock, held until the vendor call is
		// recorded, means only one worker sends a job at a time; a second one skips it.
		const [job] = await tx
			.select()
			.from(printJobsTable)
			.where(
				and(eq(printJobsTable.id, jobId), eq(printJobsTable.status, "queued")),
			)
			.for("update", { skipLocked: true });
		if (!job) return { kind: "done" };

		const attempts = job.attempts + 1;
		const record = (
			status: PrintJob["status"],
			lastError: string | null = null,
		) =>
			tx
				.update(printJobsTable)
				.set({ status, attempts, lastError })
				.where(eq(printJobsTable.id, jobId));

		try {
			await vendor.print({
				printerName: job.printerName,
				labelId: job.labelId,
			});
		} catch (error) {
			if (!(error instanceof VendorError)) throw error;

			if (error.retryable && attempts < MAX_ATTEMPTS) {
				await record("queued", error.message);
				return { kind: "retry", delaySeconds: backoffSeconds(attempts) };
			}
			const reason = error.retryable
				? `${error.message} (gave up after ${attempts} attempts)`
				: error.message;
			await record("failed", reason);
			return { kind: "done" };
		}

		await record("success");
		return { kind: "done" };
	});
}
