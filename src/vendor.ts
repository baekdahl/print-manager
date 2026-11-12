import { z } from "zod";

// The vendor's contract, as far as we rely on it. Anything else in the response is ignored.
const VendorPrinterSchema = z.object({ name: z.string(), model: z.string() });
const VendorLabelSchema = z.object({
	id: z.string(),
	name: z.string(),
	version: z.string(),
});

export type VendorPrinter = z.infer<typeof VendorPrinterSchema>;
export type VendorLabel = z.infer<typeof VendorLabelSchema>;

export interface VendorClient {
	getPrinters(): Promise<VendorPrinter[]>;
	getLabels(): Promise<VendorLabel[]>;
}

export class VendorError extends Error {
	override name = "VendorError";
}

// Same shape as the global fetch, and also as a Hono app's `request`, which lets tests
// run the client against the fake vendor in-process.
export type Fetch = (
	url: string,
	init?: RequestInit,
) => Response | Promise<Response>;

type HttpVendorClientOptions = {
	baseUrl: string;
	fetch?: Fetch;
	timeoutMs?: number;
};

export class HttpVendorClient implements VendorClient {
	private readonly baseUrl: string;
	private readonly fetch: Fetch;
	private readonly timeoutMs: number;

	constructor({
		baseUrl,
		fetch = globalThis.fetch,
		timeoutMs = 10_000,
	}: HttpVendorClientOptions) {
		this.baseUrl = baseUrl.replace(/\/$/, "");
		this.fetch = fetch;
		this.timeoutMs = timeoutMs;
	}

	getPrinters(): Promise<VendorPrinter[]> {
		return this.get("/Printers", z.array(VendorPrinterSchema));
	}

	getLabels(): Promise<VendorLabel[]> {
		return this.get("/Labels", z.array(VendorLabelSchema));
	}

	// Every way the call can go wrong becomes a VendorError, so callers have one thing to catch.
	private async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
		const what = `vendor GET ${path}`;

		let body: unknown;
		try {
			// The timeout covers the whole exchange, including reading the body.
			const response = await this.fetch(`${this.baseUrl}${path}`, {
				signal: AbortSignal.timeout(this.timeoutMs),
			});
			if (!response.ok) {
				throw new VendorError(`${what} returned ${response.status}`);
			}
			body = await response.json();
		} catch (error) {
			if (error instanceof VendorError) throw error;
			// AbortSignal.timeout() rejects with a DOMException named "TimeoutError".
			const reason =
				error instanceof Error && error.name === "TimeoutError"
					? `timed out after ${this.timeoutMs} ms`
					: describe(error);
			throw new VendorError(`${what} failed: ${reason}`, {
				cause: error,
			});
		}

		const parsed = schema.safeParse(body);
		if (!parsed.success) {
			throw new VendorError(
				`${what} returned an unexpected body: ${z.prettifyError(parsed.error)}`,
			);
		}
		return parsed.data;
	}
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
