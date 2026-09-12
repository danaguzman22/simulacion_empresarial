CREATE TYPE "public"."game_state_phase" AS ENUM('preparation', 'initial', 'current', 'final');--> statement-breakpoint
CREATE TABLE "game_preparation_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"state_set_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"transaction_id" text DEFAULT pg_current_xact_id()::text NOT NULL,
	"previous_revision" integer NOT NULL,
	"revision" integer NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_preparation_changes_revision_step" CHECK ("game_preparation_changes"."previous_revision" >= 0 and "game_preparation_changes"."revision" = "game_preparation_changes"."previous_revision" + 1),
	CONSTRAINT "game_preparation_changes_operation_valid" CHECK ("game_preparation_changes"."operation" in ('save_values', 'copy_snapshot'))
);
--> statement-breakpoint
ALTER TABLE "game_preparation_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game_state_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"phase" "game_state_phase" NOT NULL,
	"source_state_set_id" uuid,
	"frozen_at" timestamp with time zone,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_state_sets_revision_nonnegative" CHECK ("game_state_sets"."revision" >= 0),
	CONSTRAINT "game_state_sets_source_not_self" CHECK ("game_state_sets"."source_state_set_id" is null or "game_state_sets"."source_state_set_id" <> "game_state_sets"."id")
);
--> statement-breakpoint
ALTER TABLE "game_state_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game_state_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"state_set_id" uuid NOT NULL,
	"kpi_definition_id" uuid NOT NULL,
	"value" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_state_values_finite" CHECK ("game_state_values"."value"::text not in ('NaN', 'Infinity', '-Infinity')),
	CONSTRAINT "game_state_values_magnitude" CHECK (abs("game_state_values"."value") < 1000000000000000000000000::numeric)
);
--> statement-breakpoint
ALTER TABLE "game_state_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kpi_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"precision" integer DEFAULT 2 NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"allows_negative" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_definitions_key_format" CHECK ("kpi_definitions"."key" ~ '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT "kpi_definitions_name_nonempty" CHECK (length(btrim("kpi_definitions"."name")) > 0),
	CONSTRAINT "kpi_definitions_unit_nonempty" CHECK (length(btrim("kpi_definitions"."unit")) > 0),
	CONSTRAINT "kpi_definitions_precision_range" CHECK ("kpi_definitions"."precision" between 0 and 6)
);
--> statement-breakpoint
ALTER TABLE "kpi_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Unique indexes precede the composite foreign keys that reference them.
CREATE UNIQUE INDEX "game_preparation_changes_operation_unique" ON "game_preparation_changes" USING btree ("operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_preparation_changes_state_revision_unique" ON "game_preparation_changes" USING btree ("state_set_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "game_state_sets_game_phase_unique" ON "game_state_sets" USING btree ("game_id","phase");--> statement-breakpoint
CREATE UNIQUE INDEX "game_state_sets_id_campaign_unique" ON "game_state_sets" USING btree ("id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_state_values_state_kpi_unique" ON "game_state_values" USING btree ("state_set_id","kpi_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_definitions_campaign_key_unique" ON "kpi_definitions" USING btree ("campaign_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_definitions_id_campaign_unique" ON "kpi_definitions" USING btree ("id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "games_id_campaign_unique" ON "games" USING btree ("id","campaign_id");
ALTER TABLE "game_preparation_changes" ADD CONSTRAINT "game_preparation_changes_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_preparation_changes" ADD CONSTRAINT "game_preparation_changes_state_campaign_fk" FOREIGN KEY ("state_set_id","campaign_id") REFERENCES "public"."game_state_sets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_state_sets" ADD CONSTRAINT "game_state_sets_source_state_set_id_game_state_sets_id_fk" FOREIGN KEY ("source_state_set_id") REFERENCES "public"."game_state_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_state_sets" ADD CONSTRAINT "game_state_sets_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_state_sets" ADD CONSTRAINT "game_state_sets_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_state_sets" ADD CONSTRAINT "game_state_sets_game_campaign_fk" FOREIGN KEY ("game_id","campaign_id") REFERENCES "public"."games"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_state_sets" ADD CONSTRAINT "game_state_sets_source_campaign_fk" FOREIGN KEY ("source_state_set_id","campaign_id") REFERENCES "public"."game_state_sets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_state_values" ADD CONSTRAINT "game_state_values_state_campaign_fk" FOREIGN KEY ("state_set_id","campaign_id") REFERENCES "public"."game_state_sets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_state_values" ADD CONSTRAINT "game_state_values_kpi_campaign_fk" FOREIGN KEY ("kpi_definition_id","campaign_id") REFERENCES "public"."kpi_definitions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_preparation_changes_campaign_idx" ON "game_preparation_changes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "game_state_sets_campaign_idx" ON "game_state_sets" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "game_state_sets_source_idx" ON "game_state_sets" USING btree ("source_state_set_id");--> statement-breakpoint
CREATE INDEX "game_state_values_kpi_idx" ON "game_state_values" USING btree ("kpi_definition_id");--> statement-breakpoint
