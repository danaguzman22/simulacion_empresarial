-- Refuse to invent durations or remaining time for legacy rounds.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.rounds WHERE duration_seconds IS NULL OR duration_seconds<=0 OR status IN ('active','paused') OR (status='completed' AND (started_at IS NULL OR completed_at IS NULL))) THEN RAISE EXCEPTION 'Legacy rounds require explicit review before 0011'; END IF; END $$;
--> statement-breakpoint
CREATE TABLE "round_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"actor_id" uuid,
	"operation" text NOT NULL,
	"revision" integer NOT NULL,
	"request_hash" text NOT NULL,
	"details" jsonb NOT NULL,
	"transaction_id" text DEFAULT pg_current_xact_id()::text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_changes_operation_valid" CHECK ("round_changes"."operation" in ('create','set_duration','start','pause','resume','finish'))
);
--> statement-breakpoint
ALTER TABLE "round_changes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rounds" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "duration_seconds" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "campaign_id" uuid;
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "ends_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "paused_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "remaining_ms" bigint;
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "created_by" uuid;
--> statement-breakpoint
ALTER TABLE "round_changes" ADD CONSTRAINT "round_changes_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "round_changes_operation_unique" ON "round_changes" USING btree ("operation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "round_changes_revision_unique" ON "round_changes" USING btree ("round_id","revision");
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_id_game_campaign_unique" ON "rounds" USING btree ("id","game_id","campaign_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_one_execution_unique" ON "rounds" USING btree ("game_id") WHERE "rounds"."status" in ('active','paused');
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_duration_positive" CHECK ("rounds"."duration_seconds">0);
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_revision_nonnegative" CHECK ("rounds"."revision">=0);
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_clock_shape" CHECK (("rounds"."status"='pending' and "rounds"."started_at" is null and "rounds"."ends_at" is null and "rounds"."remaining_ms" is null and "rounds"."completed_at" is null) or ("rounds"."status"='active' and "rounds"."started_at" is not null and "rounds"."ends_at" is not null and "rounds"."paused_at" is null and "rounds"."remaining_ms" is null and "rounds"."completed_at" is null) or ("rounds"."status"='paused' and "rounds"."started_at" is not null and "rounds"."ends_at" is null and "rounds"."paused_at" is not null and "rounds"."remaining_ms" is not null and "rounds"."remaining_ms">0 and "rounds"."completed_at" is null) or ("rounds"."status"='completed' and "rounds"."started_at" is not null and "rounds"."completed_at" is not null and "rounds"."ends_at" is null and "rounds"."remaining_ms" is null) or "rounds"."status"='cancelled');
--> statement-breakpoint
UPDATE public.rounds r SET campaign_id=g.campaign_id FROM public.games g WHERE g.id=r.game_id;
ALTER TABLE public.rounds ALTER COLUMN campaign_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "round_changes" ADD CONSTRAINT "round_changes_round_fk" FOREIGN KEY ("round_id","game_id","campaign_id") REFERENCES "public"."rounds"("id","game_id","campaign_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_game_campaign_fk" FOREIGN KEY ("game_id","campaign_id") REFERENCES "public"."games"("id","campaign_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
REVOKE ALL ON public.round_changes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.round_changes TO service_role;
REVOKE ALL ON public.rounds FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.rounds TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.guard_round_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE game_status text; db_now timestamptz;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Round deletion is not supported'; END IF;
 SELECT status::text INTO game_status FROM public.games WHERE id=NEW.game_id FOR UPDATE;
 db_now:=clock_timestamp();
 IF TG_OP='INSERT' THEN
  IF game_status<>'active' OR NEW.status<>'pending' OR NEW.sequence<1 OR NEW.created_by IS NULL OR NEW.revision<>0 THEN RAISE EXCEPTION 'Invalid new round'; END IF;
  NEW.created_at:=db_now; NEW.updated_at:=db_now; RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.game_id,NEW.campaign_id,NEW.sequence,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.game_id,OLD.campaign_id,OLD.sequence,OLD.created_by,OLD.created_at) OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Invalid round identity or revision'; END IF;
 IF OLD.status<>'pending' AND NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds THEN RAISE EXCEPTION 'Duration cannot change after start'; END IF;
 IF OLD.status='active' AND NEW.status='completed' THEN
  IF db_now<OLD.ends_at THEN RAISE EXCEPTION 'Round has not expired'; END IF;
  NEW.completed_at:=OLD.ends_at; NEW.ends_at:=NULL; NEW.remaining_ms:=NULL; NEW.paused_at:=NULL; NEW.started_at:=OLD.started_at;
 ELSE
  IF game_status<>'active' THEN RAISE EXCEPTION 'Game must be active'; END IF;
  IF OLD.status='pending' AND NEW.status='pending' THEN
   NEW.started_at:=NULL; NEW.ends_at:=NULL; NEW.paused_at:=NULL; NEW.remaining_ms:=NULL; NEW.completed_at:=NULL;
  ELSIF OLD.status='pending' AND NEW.status='active' THEN
   IF EXISTS(SELECT 1 FROM public.rounds WHERE game_id=NEW.game_id AND sequence<NEW.sequence AND status<>'completed') THEN RAISE EXCEPTION 'Earlier rounds must be finished'; END IF;
   NEW.started_at:=db_now;NEW.ends_at:=db_now+NEW.duration_seconds*interval '1 second';NEW.remaining_ms:=NULL;NEW.paused_at:=NULL;NEW.completed_at:=NULL;
  ELSIF OLD.status='active' AND NEW.status='paused' THEN
   IF db_now>=OLD.ends_at THEN RAISE EXCEPTION 'Round already expired'; END IF;
   NEW.remaining_ms:=ceil(extract(epoch FROM (OLD.ends_at-db_now))*1000);NEW.ends_at:=NULL;NEW.paused_at:=db_now;NEW.started_at:=OLD.started_at;NEW.completed_at:=NULL;
  ELSIF OLD.status='paused' AND NEW.status='active' THEN
   NEW.ends_at:=db_now+OLD.remaining_ms*interval '1 millisecond';NEW.remaining_ms:=NULL;NEW.paused_at:=NULL;NEW.started_at:=OLD.started_at;NEW.completed_at:=NULL;
  ELSE RAISE EXCEPTION 'Invalid round transition'; END IF;
 END IF;
 NEW.updated_at:=db_now;RETURN NEW;
END; $$;
CREATE TRIGGER rounds_lifecycle_guard BEFORE INSERT OR UPDATE OR DELETE ON public.rounds FOR EACH ROW EXECUTE FUNCTION public.guard_round_lifecycle();
--> statement-breakpoint
CREATE FUNCTION public.guard_round_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Round audit is immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=NEW.round_id AND revision=NEW.revision) OR (NEW.operation<>'finish' AND NEW.actor_id IS NULL) THEN RAISE EXCEPTION 'Round audit revision/actor mismatch'; END IF;
 NEW.transaction_id:=pg_current_xact_id()::text;NEW.created_at:=clock_timestamp();RETURN NEW;
END; $$;
CREATE TRIGGER round_changes_guard BEFORE INSERT OR UPDATE OR DELETE ON public.round_changes FOR EACH ROW EXECUTE FUNCTION public.guard_round_change();
--> statement-breakpoint
CREATE FUNCTION public.check_round_audited() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.round_changes WHERE round_id=NEW.id AND revision=NEW.revision AND transaction_id=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'Round mutation requires audit in the same transaction';END IF;RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER rounds_audited AFTER INSERT OR UPDATE ON public.rounds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_round_audited();
REVOKE ALL ON FUNCTION public.guard_round_lifecycle(),public.guard_round_change(),public.check_round_audited() FROM PUBLIC,anon,authenticated;
