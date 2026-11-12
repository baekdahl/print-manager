import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../env";

// One pool per process, shared by routes and sync.
export const db = drizzle(env.DATABASE_URL);
