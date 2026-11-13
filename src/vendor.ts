import { z } from "zod";
import { env } from "./env";

// The vendor's contract, as far as we rely on it. Anything else in the response is ignored.
const VendorPrinterSchema = z.object({ name: z.string(), model: z.string() });
const VendorLabelSchema = z.object({
	id: z.string(),
	name: z.string(),
	version: z.string(),
});

export type VendorPrinter = z.infer<typeof VendorPrinterSchema>;
export type VendorLabel = z.infer<typeof VendorLabelSchema>;
export type VendorPrintRequest = { printerName: string; labelId: string };

export interface VendorClient {
	getPrinters(): Promise<VendorPrinter[]>;
	getLabels(): Promise<VendorLabel[]>;
	print(request: VendorPrintRequest): Promise<void>;
}

/**
 * `retryable` is true only when we know the vendor did nothing: it answered 500, or we
 * never got a connection to it. Anything else may have printed, or will fail again.
 */
export class VendorError extends Error {
	override name = "VendorError";
	readonly retryable: boolean;

	constructor(
		message: string,
		{
			retryable = false,
			...options
		}: ErrorOptions & { retryable?: boolean } = {},
	) {
		super(message, options);
		this.retryable = retryable;
	}
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

	async print(request: VendorPrintRequest): Promise<void> {
		await this.exchange(
			"/Print",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(request),
			},
			async (response) => {
				await response.body?.cancel();
			},
		);
	}

	private async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
		const body = await this.exchange(path, {}, (response) => response.json());

		const parsed = schema.safeParse(body);
		if (!parsed.success) {
			throw new VendorError(
				`vendor GET ${path} returned an unexpected body: ${z.prettifyError(parsed.error)}`,
			);
		}
		return parsed.data;
	}

	// Every way the call can go wrong becomes a VendorError, so callers have one thing to catch.
	private async exchange<T>(
		path: string,
		init: RequestInit,
		read: (response: Response) => Promise<T>,
	): Promise<T> {
		const what = `vendor ${init.method ?? "GET"} ${path}`;

		try {
			// The timeout covers the whole exchange, including reading the body.
			const response = await this.fetch(`${this.baseUrl}${path}`, {
				...init,
				signal: AbortSignal.timeout(this.timeoutMs),
			});
			if (!response.ok) {
				await response.body?.cancel();
				throw new VendorError(`${what} returned ${response.status}`, {
					retryable: response.status === 500,
				});
			}
			return await read(response);
		} catch (error) {
			if (error instanceof VendorError) throw error;
			// AbortSignal.timeout() rejects with a DOMException named "TimeoutError".
			if (error instanceof Error && error.name === "TimeoutError") {
				throw new VendorError(
					`${what} failed: timed out after ${this.timeoutMs} ms`,
					{ cause: error },
				);
			}
			const code = connectErrorCode(error);
			throw new VendorError(`${what} failed: ${code ?? describe(error)}`, {
				cause: error,
				retryable: code !== undefined,
			});
		}
	}
}

export function vendorFromEnv(): VendorClient {
	return new HttpVendorClient({ baseUrl: env.VENDOR_URL });
}

// Errors that happen before the request is sent, so the vendor can't have acted on it.
const CONNECT_ERROR_CODES = new Set([
	"ECONNREFUSED",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
]);

// fetch wraps network errors: TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }).
function connectErrorCode(error: unknown): string | undefined {
	for (let e = error; e instanceof Object; e = (e as Error).cause) {
		const code = (e as { code?: unknown }).code;
		if (typeof code === "string" && CONNECT_ERROR_CODES.has(code)) return code;
	}
	return undefined;
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
