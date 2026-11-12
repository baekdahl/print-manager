import { beforeEach, describe, expect, test } from "vitest";
import { resetDatabase } from "../../test/db";
import { get, patch } from "../../test/http";
import { stubVendor } from "../../test/vendor";
import { sync } from "../sync";

const vendorLabels = [
	{ id: "lbl_1", name: "shipping", version: "1" },
	{ id: "lbl_2", name: "shipping", version: "2" },
	{ id: "lbl_9", name: "pallet", version: "1" },
];

beforeEach(async () => {
	await resetDatabase();
	await sync(stubVendor({ labels: vendorLabels }));
});

const label = (
	id: string,
	name: string,
	version: string,
	metadata: { nickname?: string; isPrimary?: boolean } = {},
) => ({
	id,
	name,
	version,
	metadata: { nickname: null, isPrimary: false, ...metadata },
});

const isPrimary = async (id: string) =>
	(await (await get(`/labels/${id}`)).json()).metadata.isPrimary;

const removeAtVendor = (id: string) =>
	sync(stubVendor({ labels: vendorLabels.filter((l) => l.id !== id) }));

describe("GET /labels", () => {
	test("lists labels by name, with our fields under metadata", async () => {
		const res = await get("/labels");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([
			label("lbl_9", "pallet", "1"),
			label("lbl_1", "shipping", "1"),
			label("lbl_2", "shipping", "2"),
		]);
	});

	test("leaves out removed labels", async () => {
		await removeAtVendor("lbl_1");

		expect(
			(await (await get("/labels")).json()).map((l: { id: string }) => l.id),
		).toEqual(["lbl_9", "lbl_2"]);
	});
});

describe("GET /labels/{id}", () => {
	test("returns the label", async () => {
		expect(await (await get("/labels/lbl_2")).json()).toEqual(
			label("lbl_2", "shipping", "2"),
		);
	});

	test("an unknown or removed label is a 404", async () => {
		await removeAtVendor("lbl_1");

		expect((await get("/labels/nope")).status).toBe(404);
		expect((await get("/labels/lbl_1")).status).toBe(404);
	});
});

describe("PATCH /labels/{id}", () => {
	test("sets and clears the nickname", async () => {
		const set = await patch("/labels/lbl_1", { nickname: "Shipping" });
		expect(await set.json()).toEqual(
			label("lbl_1", "shipping", "1", { nickname: "Shipping" }),
		);

		const cleared = await patch("/labels/lbl_1", { nickname: null });
		expect(await cleared.json()).toEqual(label("lbl_1", "shipping", "1"));
	});

	test("making a label primary clears it on the other versions with the same name", async () => {
		await patch("/labels/lbl_1", { isPrimary: true });
		await patch("/labels/lbl_9", { isPrimary: true });

		const res = await patch("/labels/lbl_2", { isPrimary: true });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(
			label("lbl_2", "shipping", "2", { isPrimary: true }),
		);
		expect(await isPrimary("lbl_1")).toBe(false);
		// A different name keeps its own primary.
		expect(await isPrimary("lbl_9")).toBe(true);
	});

	test("making the primary label primary again is fine", async () => {
		await patch("/labels/lbl_1", { isPrimary: true });

		const res = await patch("/labels/lbl_1", { isPrimary: true });

		expect(res.status).toBe(200);
		expect(await isPrimary("lbl_1")).toBe(true);
	});

	test("isPrimary: false unsets it, leaving the name without a primary", async () => {
		await patch("/labels/lbl_1", { isPrimary: true });

		await patch("/labels/lbl_1", { isPrimary: false });

		expect(await isPrimary("lbl_1")).toBe(false);
		expect(await isPrimary("lbl_2")).toBe(false);
	});

	test("isPrimary can't be null", async () => {
		const res = await patch("/labels/lbl_1", { isPrimary: null });

		expect(res.status).toBe(400);
		expect((await res.json()).errors[0].path).toEqual(["isPrimary"]);
	});

	test("vendor fields are rejected", async () => {
		const res = await patch("/labels/lbl_1", { version: "7" });

		expect(res.status).toBe(400);
		expect((await res.json()).errors).toEqual([
			{ path: ["version"], message: "Unrecognized key" },
		]);
	});

	test("an unknown or removed label is a 404", async () => {
		await removeAtVendor("lbl_1");

		expect((await patch("/labels/nope", { isPrimary: true })).status).toBe(404);
		expect((await patch("/labels/lbl_1", { isPrimary: true })).status).toBe(
			404,
		);
	});

	test("a removed label doesn't block its sibling from becoming primary", async () => {
		await patch("/labels/lbl_1", { isPrimary: true });
		await removeAtVendor("lbl_1");

		const res = await patch("/labels/lbl_2", { isPrimary: true });

		expect(res.status).toBe(200);
	});
});
