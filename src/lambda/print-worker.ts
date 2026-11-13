import type { SQSHandler } from "aws-lambda";
import { handlePrintJobMessages } from "../print-worker";
import { vendorFromEnv } from "../vendor";

const vendor = vendorFromEnv();

// Invoked by the SQS event source mapping, with ReportBatchItemFailures turned on.
export const handler: SQSHandler = (event) =>
	handlePrintJobMessages(event.Records, vendor);
