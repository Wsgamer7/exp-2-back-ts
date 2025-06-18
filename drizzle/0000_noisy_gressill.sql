CREATE TABLE "exp_2"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exp_2"."poll" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"extra_info" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exp_2"."poll_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid,
	"option_key" varchar(2) NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exp_2"."poll_tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exp_2"."poll_tag_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid,
	"tag_id" uuid,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exp_2"."poll_vote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid,
	"option_id" uuid,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exp_2"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "exp_2"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "exp_2"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "exp_2"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "exp_2"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_option" ADD CONSTRAINT "poll_option_poll_id_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "exp_2"."poll"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_tag_map" ADD CONSTRAINT "poll_tag_map_poll_id_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "exp_2"."poll"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_tag_map" ADD CONSTRAINT "poll_tag_map_tag_id_poll_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "exp_2"."poll_tag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_vote" ADD CONSTRAINT "poll_vote_poll_id_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "exp_2"."poll"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exp_2"."poll_vote" ADD CONSTRAINT "poll_vote_option_id_poll_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "exp_2"."poll_option"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exp_2"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "exp_2"."user"("id") ON DELETE cascade ON UPDATE no action;