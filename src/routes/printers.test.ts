import { beforeEach, expect, test } from "vitest";
import { resetDatabase } from "../../test/db";
import { syncPrinters } from "../sync";
import { app } from "../app";
import { STATUS_CODES } from "http";

beforeEach(resetDatabase);

test("Get new printer", async () => {
	await syncPrinters({
		getPrinters: () => [
			{
				name: "printer",
				model: "brother",
			},
		],
	});

	const res = await app.request("/printers/printer");
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({
		vendorName: "printer",
		vendorModel: "brother",
		location: null,
		nickname: null,
		serialNumber: null,
		deleted: false,
	});
});

test("Update printer", async () => {
	await syncPrinters({
		getPrinters: () => [
			{
				name: "printer",
				model: "brother",
			},
		],
	});

	const res = await app.request("/printers/printer");
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({
		vendorName: "printer",
		vendorModel: "brother",
		location: null,
		nickname: null,
		serialNumber: null,
		deleted: false,
	});

	const patchRes = await app.request("/printers/printer", {
		method: "PATCH",
		body: JSON.stringify({ nickname: "bob" }),
		headers: {
			"content-type": "application/json",
		},
	});
	expect(patchRes.status).toBe(200);
	expect(await patchRes.json()).toEqual({
		vendorName: "printer",
		vendorModel: "brother",
		location: null,
		nickname: "bob",
		serialNumber: null,
		deleted: false,
	});
});
