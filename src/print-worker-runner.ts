import {
	DeleteMessageBatchCommand,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import { handlePrintJobMessages, type PrintJobRecord } from "./print-worker";
import { printJobQueue, sqs } from "./queue";
import type { VendorClient } from "./vendor";

/**
 * Local stand-in for Lambda's SQS event source mapping: long-polls the queue, hands each
 * batch to the same handler the Lambda uses, and deletes the messages that succeeded.
 */
export function startPrintWorkerLoop(vendor: VendorClient) {
	let running = true;

	const loop = async () => {
		while (running) {
			try {
				await receiveOnce(vendor);
			} catch (error) {
				console.error("print worker poll failed:", error);
				await new Promise((resolve) => setTimeout(resolve, 5_000));
			}
		}
	};
	void loop();

	return () => {
		running = false;
	};
}

export async function receiveOnce(vendor: VendorClient, waitSeconds = 20) {
	const { Messages = [] } = await sqs.send(
		new ReceiveMessageCommand({
			QueueUrl: printJobQueue.url,
			MaxNumberOfMessages: 10,
			WaitTimeSeconds: waitSeconds,
		}),
	);
	const records: PrintJobRecord[] = Messages.map((m) => ({
		messageId: m.MessageId ?? "",
		receiptHandle: m.ReceiptHandle ?? "",
		body: m.Body ?? "",
	}));
	if (records.length === 0) return;

	const { batchItemFailures } = await handlePrintJobMessages(records, vendor);
	const failed = new Set(batchItemFailures.map((f) => f.itemIdentifier));
	const succeeded = records.filter((r) => !failed.has(r.messageId));
	if (succeeded.length === 0) return;

	await sqs.send(
		new DeleteMessageBatchCommand({
			QueueUrl: printJobQueue.url,
			Entries: succeeded.map((r, i) => ({
				Id: String(i),
				ReceiptHandle: r.receiptHandle,
			})),
		}),
	);
}
