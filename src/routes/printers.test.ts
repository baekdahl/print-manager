import { beforeEach, expect, test } from "vitest";
import { resetDatabase } from "../../test/db";
import { stubVendor } from "../../test/vendor";
import { app } from "../app";
import { syncPrinters } from "../sync";

beforeEach(resetDatabase);

test("Get new printer", async () => {
	await syncPrinters(
		stubVendor({ printers: [{ name: "printer", model: "brother" }] }),
	);

	const res = await app.request("/printers/printer");
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({
		name: "printer",
		model: "brother",
		location: null,
		nickname: null,
		serialNumber: null,
		deleted: false,
	});
});

test("Update printer", async () => {
	await syncPrinters(
		stubVendor({ printers: [{ name: "printer", model: "brother" }] }),
	);

	const res = await app.request("/printers/printer");
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({
		name: "printer",
		model: "brother",
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
		name: "printer",
		model: "brother",
		location: null,
		nickname: "bob",
		serialNumber: null,
		deleted: false,
	});
});
