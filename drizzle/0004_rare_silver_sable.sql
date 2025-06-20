ALTER TABLE "exp_2"."poll_tag_map" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "exp_2"."poll_tag_map" CASCADE;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_tag" ADD COLUMN "poll_id" uuid;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_tag" ADD CONSTRAINT "poll_tag_poll_id_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "exp_2"."poll"("id") ON DELETE no action ON UPDATE no action;