CREATE TYPE "print_job_status" AS ENUM('queued', 'submitted', 'failed');--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"printerName" text NOT NULL,
	"labelId" text NOT NULL,
	"status" "print_job_status" DEFAULT 'queued'::"print_job_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printerName_printers_name_fkey" FOREIGN KEY ("printerName") REFERENCES "printers"("name");--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_labelId_labels_id_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id");