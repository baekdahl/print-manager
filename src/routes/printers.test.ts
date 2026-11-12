import { beforeEach, describe, expect, test } from "vitest";
import { resetDatabase } from "../../test/db";
import { get, patch } from "../../test/http";
import { stubVendor } from "../../test/vendor";
import { sync } from "../sync";

beforeEach(async () => {
	await resetDatabase();
	await sync(
		stubVendor({
			printers: [
				{ name: "ZD420-HALL-B", model: "ZD420" },
				{ name: "Hall B/2", model: "ZD621" },
			],
		}),
	);
});

const printer = (name: string, model: string, metadata = {}) => ({
	name,
	model,
	metadata: { nickname: null, location: null, serialNumber: null, ...metadata },
});

const removePrinterAtVendor = () =>
	sync(stubVendor({ printers: [{ name: "Hall B/2", model: "ZD621" }] }));

describe("GET /printers", () => {
	test("lists printers with vendor fields on top and our fields under metadata", async () => {
		const res = await get("/printers");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([
			printer("Hall B/2", "ZD621"),
			printer("ZD420-HALL-B", "ZD420"),
		]);
	});

	test("leaves out removed printers", async () => {
		await removePrinterAtVendor();

		expect(await (await get("/printers")).json()).toEqual([
			printer("Hall B/2", "ZD621"),
		]);
	});
});

describe("GET /printers/{name}", () => {
	test("returns the printer", async () => {
		const res = await get("/printers/ZD420-HALL-B");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(printer("ZD420-HALL-B", "ZD420"));
	});

	test("accepts a URL-encoded name", async () => {
		const res = await get(`/printers/${encodeURIComponent("Hall B/2")}`);

		expect(await res.json()).toEqual(printer("Hall B/2", "ZD621"));
	});

	test("an unknown printer is a 404 problem", async () => {
		const res = await get("/printers/nope");

		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toBe("application/problem+json");
		expect(await res.json()).toEqual({
			type: "about:blank",
			title: "Not Found",
			status: 404,
		});
	});

	test("a removed printer is a 404", async () => {
		await removePrinterAtVendor();

		expect((await get("/printers/ZD420-HALL-B")).status).toBe(404);
	});
});

describe("PATCH /printers/{name}", () => {
	test("sets metadata and returns the updated printer", async () => {
		const res = await patch("/printers/ZD420-HALL-B", {
			nickname: "Hall B left",
			location: "Building 2",
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(
			printer("ZD420-HALL-B", "ZD420", {
				nickname: "Hall B left",
				location: "Building 2",
			}),
		);
	});

	test("a missing field is left alone and null clears a field", async () => {
		await patch("/printers/ZD420-HALL-B", {
			nickname: "Hall B left",
			location: "Building 2",
		});

		const res = await patch("/printers/ZD420-HALL-B", { location: null });

		expect(await res.json()).toEqual(
			printer("ZD420-HALL-B", "ZD420", { nickname: "Hall B left" }),
		);
	});

	test("an empty patch changes nothing", async () => {
		const res = await patch("/printers/ZD420-HALL-B", {});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(printer("ZD420-HALL-B", "ZD420"));
	});

	test("the change is visible to later reads", async () => {
		await patch("/printers/ZD420-HALL-B", { serialNumber: "52J193300123" });

		expect(await (await get("/printers/ZD420-HALL-B")).json()).toEqual(
			printer("ZD420-HALL-B", "ZD420", { serialNumber: "52J193300123" }),
		);
	});

	test("a vendor field is rejected as an unknown field", async () => {
		const res = await patch("/printers/ZD420-HALL-B", { model: "ZD999" });

		expect(res.status).toBe(400);
		expect(res.headers.get("content-type")).toBe("application/problem+json");
		expect(await res.json()).toEqual({
			type: "about:blank",
			title: "Bad Request",
			status: 400,
			detail: "Invalid request json",
			errors: [{ path: ["model"], message: "Unrecognized key" }],
		});
	});

	test("a wrong type is rejected", async () => {
		const res = await patch("/printers/ZD420-HALL-B", { nickname: 42 });

		expect(res.status).toBe(400);
		expect((await res.json()).errors).toEqual([
			{ path: ["nickname"], message: expect.any(String) },
		]);
	});

	test("malformed JSON is a 400 problem", async () => {
		const res = await patch("/printers/ZD420-HALL-B", "{nope");

		expect(res.status).toBe(400);
		expect(res.headers.get("content-type")).toBe("application/problem+json");
	});

	test("an unknown printer is a 404", async () => {
		expect((await patch("/printers/nope", { nickname: "x" })).status).toBe(404);
	});

	test("a removed printer is a 404, even for an empty patch", async () => {
		await removePrinterAtVendor();

		expect(
			(await patch("/printers/ZD420-HALL-B", { nickname: "x" })).status,
		).toBe(404);
		expect((await patch("/printers/ZD420-HALL-B", {})).status).toBe(404);
	});
});

describe("the app", () => {
	test("an unknown route is a 404 problem", async () => {
		const res = await get("/nope");

		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toBe("application/problem+json");
	});

	test("serves an OpenAPI document generated from the route schemas", async () => {
		const doc = await (await get("/openapi.json")).json();

		expect(Object.keys(doc.paths)).toEqual(
			expect.arrayContaining(["/printers", "/printers/{name}"]),
		);
		expect(doc.components.schemas).toHaveProperty("Printer");
	});

	test("serves Swagger UI", async () => {
		expect((await get("/docs")).status).toBe(200);
	});
});
