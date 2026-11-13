import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { problem, toIssues } from "./http/problem";
import labels from "./routes/labels";
import printJobs from "./routes/print-jobs";
import printers from "./routes/printers";

export const app = new OpenAPIHono({
	// Runs whenever a request fails a route's Zod schema.
	defaultHook: (result, c) => {
		if (!result.success) {
			return problem(c, 400, {
				detail: `Invalid request ${result.target}`,
				errors: toIssues(result.error),
			});
		}
	},
});

app.route("/printers", printers);
app.route("/labels", labels);
app.route("/print-jobs", printJobs);

app.doc31("/openapi.json", {
	openapi: "3.1.0",
	info: { title: "Print manager API", version: "0.1.0" },
});
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

app.notFound((c) => problem(c, 404));

app.onError((error, c) => {
	// Hono throws HTTPException for problems it detects itself, such as malformed JSON.
	if (error instanceof HTTPException && error.status < 500) {
		return problem(c, error.status, { detail: error.message });
	}
	console.error(error);
	return problem(c, 500);
});
