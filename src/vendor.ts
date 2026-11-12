export type VendorPrinter = {
	name: string;
	model: string;
};

export interface VendorClient {
	getPrinters(): VendorPrinter[];
}

export class FakeVendorClient implements VendorClient {
	getPrinters(): VendorPrinter[] {
		return [
			{
				name: "printer 1",
				model: "brother",
			},
			{
				name: "printer 2",
				model: "HP",
			},
		];
	}
}
