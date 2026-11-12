import type { VendorClient, VendorLabel, VendorPrinter } from "../src/vendor";

// A VendorClient that returns fixed data, for tests that don't care about HTTP.
export function stubVendor({
	printers = [],
	labels = [],
}: {
	printers?: VendorPrinter[];
	labels?: VendorLabel[];
} = {}): VendorClient {
	return {
		getPrinters: async () => printers,
		getLabels: async () => labels,
	};
}
