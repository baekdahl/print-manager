CREATE TABLE "labels" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"nickname" text,
	"isPrimary" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"name" text PRIMARY KEY,
	"model" text NOT NULL,
	"nickname" text,
	"location" text,
	"serialNumber" text,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "labels_one_primary_per_name" ON "labels" ("name") WHERE "isPrimary" and not "deleted";