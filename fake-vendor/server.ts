import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { createFakeVendor } from "./app";

const port = Number(process.env.FAKE_VENDOR_PORT ?? 4000);

const server = new Hono().use(logger()).route("/", createFakeVendor());

serve({ fetch: server.fetch, port }, () => {
	console.log(`Fake vendor listening on http://localhost:${port}`);
});
