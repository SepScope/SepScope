CREATE TYPE "public"."check_status" AS ENUM('pass', 'warn', 'fail', 'skipped');--> statement-breakpoint
CREATE TABLE "anchors" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"network" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "anchors_domain_unique" UNIQUE("domain"),
	CONSTRAINT "anchors_network_check" CHECK ("anchors"."network" in ('pubnet', 'testnet'))
);
--> statement-breakpoint
CREATE TABLE "check_results" (
	"run_id" bigint NOT NULL,
	"check_id" text NOT NULL,
	"status" "check_status" NOT NULL,
	"latency_ms" integer,
	"detail" jsonb,
	"error" text,
	CONSTRAINT "check_results_run_id_check_id_pk" PRIMARY KEY("run_id","check_id")
);
--> statement-breakpoint
CREATE TABLE "check_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"anchor_id" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_run_id_check_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."check_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_anchor_id_anchors_id_fk" FOREIGN KEY ("anchor_id") REFERENCES "public"."anchors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_results_check_idx" ON "check_results" USING btree ("check_id");--> statement-breakpoint
CREATE INDEX "check_runs_anchor_started_idx" ON "check_runs" USING btree ("anchor_id","started_at" DESC NULLS LAST);