import type { SQSBatchResponse, SQSRecord } from "aws-lambda";
import { z } from "zod";
import { processPrintJob } from "./print-jobs";
import { printJobQueue } from "./queue";
import type { VendorClient } from "./vendor";

const MessageSchema = z.object({ jobId: z.uuid() });

export type PrintJobRecord = Pick<
	SQSRecord,
	"messageId" | "receiptHandle" | "body"
>;

/**
 * Handles a batch of SQS messages, in the shape Lambda delivers them.
 *
 * Messages listed in `batchItemFailures` stay on the queue; the rest are deleted.
 * A retry first moves the message's visibility timeout to the backoff delay. An
 * unexpected error leaves it at the queue default, and after enough of those the
 * message goes to the dead-letter queue.
 */
export async function handlePrintJobMessages(
	records: PrintJobRecord[],
	vendor: VendorClient,
): Promise<SQSBatchResponse> {
	const results = await Promise.all(
		records.map(async (record) => {
			try {
				const message = MessageSchema.safeParse(safeJsonParse(record.body));
				if (!message.success) {
					console.error(`dropping malformed message ${record.messageId}`);
					return undefined;
				}

				const result = await processPrintJob(message.data.jobId, vendor);
				if (result.kind === "done") return undefined;

				await printJobQueue.retryAfter(
					record.receiptHandle,
					result.delaySeconds,
				);
				return record.messageId;
			} catch (error) {
				console.error(`print job message ${record.messageId} failed:`, error);
				return record.messageId;
			}
		}),
	);

	return {
		batchItemFailures: results
			.filter((id) => id !== undefined)
			.map((itemIdentifier) => ({ itemIdentifier })),
	};
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
