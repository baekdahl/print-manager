import {
	ChangeMessageVisibilityCommand,
	SendMessageCommand,
	SQSClient,
} from "@aws-sdk/client-sqs";
import { env } from "./env";

const { PRINT_JOBS_QUEUE_URL } = env;

// Locally, AWS_ENDPOINT_URL_SQS points the SDK at ElasticMQ instead of AWS.
export const sqs = new SQSClient({});

export type PrintJobMessage = { jobId: string };

// An object rather than loose functions, so tests can stub one method with vi.spyOn.
export const printJobQueue = {
	url: PRINT_JOBS_QUEUE_URL,

	async send(message: PrintJobMessage) {
		await sqs.send(
			new SendMessageCommand({
				QueueUrl: PRINT_JOBS_QUEUE_URL,
				MessageBody: JSON.stringify(message),
			}),
		);
	},

	// The message stays on the queue and is delivered again after `seconds`.
	async retryAfter(receiptHandle: string, seconds: number) {
		await sqs.send(
			new ChangeMessageVisibilityCommand({
				QueueUrl: PRINT_JOBS_QUEUE_URL,
				ReceiptHandle: receiptHandle,
				VisibilityTimeout: seconds,
			}),
		);
	},
};
