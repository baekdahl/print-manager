import "dotenv/config";

function deriveFromDevUrl() {
	const devUrl = process.env.DATABASE_URL;
	if (!devUrl) throw new Error("DATABASE_URL is not set");

	const url = new URL(devUrl);
	url.pathname = `${url.pathname}_test`;
	return url.toString();
}

export const testDatabaseUrl =
	process.env.TEST_DATABASE_URL ?? deriveFromDevUrl();
export const testDatabaseName = new URL(testDatabaseUrl).pathname.slice(1);
