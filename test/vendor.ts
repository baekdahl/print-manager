import type {
	VendorClient,
	VendorLabel,
	VendorPrinter,
	VendorPrintRequest,
} from "../src/vendor";

// A VendorClient that returns fixed data, for tests that don't care about HTTP.
export function stubVendor({
	printers = [],
	labels = [],
	print = async () => {},
}: {
	printers?: VendorPrinter[];
	labels?: VendorLabel[];
	print?: (request: VendorPrintRequest) => Promise<void>;
} = {}): VendorClient {
	return {
		getPrinters: async () => printers,
		getLabels: async () => labels,
		print,
	};
}
