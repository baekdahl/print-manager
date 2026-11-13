import { testDatabaseUrl } from "./database-url";

process.env.TEST_DATABASE_URL = testDatabaseUrl;
process.env.DATABASE_URL = testDatabaseUrl;
// A separate queue, so tests don't eat messages meant for a running dev server.
process.env.PRINT_JOBS_QUEUE_URL =
	process.env.TEST_PRINT_JOBS_QUEUE_URL ??
	`${process.env.PRINT_JOBS_QUEUE_URL}-test`;
