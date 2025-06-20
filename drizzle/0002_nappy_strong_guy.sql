ALTER TABLE "exp_2"."poll_vote" ALTER COLUMN "poll_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_vote" ALTER COLUMN "option_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exp_2"."poll" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_option" ADD COLUMN "confidence" text NOT NULL;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_option" ADD COLUMN "count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_option" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "exp_2"."poll_option" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "exp_2"."poll_option" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_tag" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_tag_map" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "exp_2"."poll_tag_map" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "exp_2"."poll_tag_map" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_vote" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exp_2"."poll" DROP COLUMN "result";