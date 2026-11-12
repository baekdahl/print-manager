import { serve } from "@hono/node-server";
import { createFakeVendor } from "./app";

const port = Number(process.env.FAKE_VENDOR_PORT ?? 4000);

serve({ fetch: createFakeVendor().fetch, port }, () => {
	console.log(`Fake vendor listening on http://localhost:${port}`);
});
