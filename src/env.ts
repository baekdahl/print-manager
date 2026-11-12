import z from "zod";
import "dotenv/config";

const EnvSchema = z.object({
	DATABASE_URL: z.string(),
});

export const env = EnvSchema.parse(process.env);
