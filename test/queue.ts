import {
	GetQueueAttributesCommand,
	PurgeQueueCommand,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import { printJobQueue, sqs } from "../src/queue";

export async function purgeQueue() {
	await sqs.send(new PurgeQueueCommand({ QueueUrl: printJobQueue.url }));
}

// Takes the waiting messages off the queue (they become invisible), returning their bodies.
export async function takeMessages() {
	const { Messages = [] } = await sqs.send(
		new ReceiveMessageCommand({
			QueueUrl: printJobQueue.url,
			MaxNumberOfMessages: 10,
			WaitTimeSeconds: 0,
		}),
	);
	return Messages.map((m) => JSON.parse(m.Body ?? ""));
}

export async function queueCounts() {
	const { Attributes = {} } = await sqs.send(
		new GetQueueAttributesCommand({
			QueueUrl: printJobQueue.url,
			AttributeNames: [
				"ApproximateNumberOfMessages",
				"ApproximateNumberOfMessagesNotVisible",
			],
		}),
	);
	return {
		waiting: Number(Attributes.ApproximateNumberOfMessages),
		inFlight: Number(Attributes.ApproximateNumberOfMessagesNotVisible),
	};
}
