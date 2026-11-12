import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";

// RFC 9457 "problem details", used for every error response.

const titles: Partial<Record<ContentfulStatusCode, string>> = {
	400: "Bad Request",
	404: "Not Found",
	500: "Internal Server Error",
};

const IssueSchema = z.object({
	path: z.array(z.union([z.string(), z.number()])),
	message: z.string(),
});

export const ProblemSchema = z
	.object({
		type: z.string().openapi({ example: "about:blank" }),
		title: z.string().openapi({ example: "Not Found" }),
		status: z.number().int().openapi({ example: 404 }),
		detail: z.string().optional(),
		errors: z.array(IssueSchema).optional(),
	})
	.openapi("Problem");

type Problem = z.infer<typeof ProblemSchema>;

// Generic over the status so the literal (404, not "any status") reaches the route's
// response types, which zod-openapi checks against the route definition.
export function problem<Status extends ContentfulStatusCode>(
	c: Context,
	status: Status,
	extra: Pick<Problem, "detail" | "errors"> = {},
) {
	const body: Problem = {
		type: "about:blank",
		title: titles[status] ?? "Error",
		status,
		...extra,
	};
	return c.json(body, status, { "Content-Type": "application/problem+json" });
}

// For the OpenAPI spec: `responses: { 404: problemResponse("…") }`.
export function problemResponse(description: string) {
	return {
		description,
		content: { "application/problem+json": { schema: ProblemSchema } },
	};
}

// Flattens Zod issues into `{ path, message }`. An unknown key is reported at its own
// path (["model"]) rather than at the object that contains it ([]).
export function toIssues(error: ZodError): Problem["errors"] {
	return error.issues.flatMap((issue) =>
		issue.code === "unrecognized_keys"
			? issue.keys.map((key) => ({
					path: [...issue.path.map(pathSegment), key],
					message: "Unrecognized key",
				}))
			: [{ path: issue.path.map(pathSegment), message: issue.message }],
	);
}

function pathSegment(segment: PropertyKey): string | number {
	return typeof segment === "number" ? segment : String(segment);
}
