import { app } from "../src/app";

export function get(path: string) {
	return app.request(path);
}

export function patch(path: string, body: unknown) {
	return app.request(path, {
		method: "PATCH",
		body: typeof body === "string" ? body : JSON.stringify(body),
		headers: { "content-type": "application/json" },
	});
}
