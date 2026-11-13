import { sync } from "../sync";
import { vendorFromEnv } from "../vendor";

const vendor = vendorFromEnv();

// Invoked by EventBridge Scheduler. Errors are thrown on purpose, so the invocation
// counts as failed and can be alarmed on.
export const handler = () => sync(vendor);
