import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { env } from "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { printersTable } from "./db/schema";

import printers from "./routes/printers";

export const app = new Hono();

app.route("/printers", printers);

app.get("/", (c) => {
	return c.text("Hello World!");
});
