import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
	DATABASE_URL: z.string(),
	VENDOR_URL: z.url(),
	PRINT_JOBS_QUEUE_URL: z.url(),
	SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
	PORT: z.coerce.number().int().positive().default(3000),
});

export const env = EnvSchema.parse(process.env);
