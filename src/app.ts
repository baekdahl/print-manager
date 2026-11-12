import { Hono } from "hono";
import printers from "./routes/printers";

export const app = new Hono();

app.route("/printers", printers);
