CREATE TYPE "public"."game_status" AS ENUM('draft', 'ready', 'active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."game_type" AS ENUM('onboarding', 'development', 'final', 'custom');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('open', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('pending', 'active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "game_type" DEFAULT 'development' NOT NULL,
	"status" "game_status" DEFAULT 'draft' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"name" text,
	"status" "round_status" DEFAULT 'pending' NOT NULL,
	"duration_seconds" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"code" varchar(8) NOT NULL,
	"status" "room_status" DEFAULT 'open' NOT NULL,
	"active_game_id" uuid,
	"active_round_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_active_game_id_games_id_fk" FOREIGN KEY ("active_game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_active_round_id_rounds_id_fk" FOREIGN KEY ("active_round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "games_campaign_sequence_unique" ON "games" USING btree ("campaign_id","sequence");--> statement-breakpoint
CREATE INDEX "games_campaign_id_idx" ON "games" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_game_sequence_unique" ON "rounds" USING btree ("game_id","sequence");--> statement-breakpoint
CREATE INDEX "rounds_game_id_idx" ON "rounds" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "rounds_status_idx" ON "rounds" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_unique" ON "rooms" USING btree ("code");--> statement-breakpoint
CREATE INDEX "rooms_campaign_id_idx" ON "rooms" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "rooms_status_idx" ON "rooms" USING btree ("status");