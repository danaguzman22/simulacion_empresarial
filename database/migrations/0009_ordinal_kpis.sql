CREATE TYPE "public"."kpi_value_type" AS ENUM('numeric', 'ordinal');--> statement-breakpoint
CREATE TABLE "kpi_ordinal_options" (
	"kpi_definition_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "kpi_ordinal_options_pk" PRIMARY KEY("kpi_definition_id","key"),
	CONSTRAINT "kpi_ordinal_options_key_format" CHECK ("kpi_ordinal_options"."key" ~ '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT "kpi_ordinal_options_label_nonempty" CHECK (length(btrim("kpi_ordinal_options"."label")) > 0),
	CONSTRAINT "kpi_ordinal_options_position_valid" CHECK ("kpi_ordinal_options"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "kpi_ordinal_options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "game_state_values" ALTER COLUMN "value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state_values" ADD COLUMN "ordinal_key" text;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD COLUMN "value_type" "kpi_value_type" DEFAULT 'numeric' NOT NULL;--> statement-breakpoint
ALTER TABLE "kpi_ordinal_options" ADD CONSTRAINT "kpi_ordinal_options_kpi_definition_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_definition_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_ordinal_options_position_unique" ON "kpi_ordinal_options" USING btree ("kpi_definition_id","position");--> statement-breakpoint
ALTER TABLE "game_state_values" ADD CONSTRAINT "game_state_values_ordinal_option_fk" FOREIGN KEY ("kpi_definition_id","ordinal_key") REFERENCES "public"."kpi_ordinal_options"("kpi_definition_id","key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_state_values" ADD CONSTRAINT "game_state_values_exactly_one_value" CHECK (("game_state_values"."value" is not null) <> ("game_state_values"."ordinal_key" is not null));

--> statement-breakpoint

-- kpi_ordinal_options is server-only, like the rest of the preparation model.
REVOKE ALL ON TABLE public.kpi_ordinal_options
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.kpi_ordinal_options
TO service_role;

--> statement-breakpoint

-- Extend KPI semantic protection to include the value type.
CREATE OR REPLACE FUNCTION public.guard_kpi_definition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  semantic_change boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.historical_used_at IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.game_kpis
        WHERE kpi_definition_id = OLD.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.game_state_values
        WHERE kpi_definition_id = OLD.id
      )
    THEN
      RAISE EXCEPTION
        'Remove editable game associations first; historical KPIs cannot be deleted';
    END IF;

    RETURN OLD;
  END IF;

  IF ROW(
    NEW.id,
    NEW.campaign_id,
    NEW.created_by,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.campaign_id,
    OLD.created_by,
    OLD.created_at
  )
  OR (
    OLD.historical_used_at IS NOT NULL
    AND NEW.historical_used_at IS DISTINCT FROM OLD.historical_used_at
  )
  OR (
    OLD.used_at IS NOT NULL
    AND NEW.used_at IS DISTINCT FROM OLD.used_at
  )
  THEN
    RAISE EXCEPTION
      'KPI identity and usage markers are immutable';
  END IF;

  semantic_change := ROW(
    NEW.key,
    NEW.name,
    NEW.unit,
    NEW.precision,
    NEW.allows_negative,
    NEW.value_type
  ) IS DISTINCT FROM ROW(
    OLD.key,
    OLD.name,
    OLD.unit,
    OLD.precision,
    OLD.allows_negative,
    OLD.value_type
  );

  IF semantic_change THEN
    IF OLD.historical_used_at IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.game_kpis k
        JOIN public.games g
          ON g.id = k.game_id
        WHERE k.kpi_definition_id = OLD.id
          AND (
            k.historical_used_at IS NOT NULL
            OR g.status NOT IN ('draft', 'ready')
            OR EXISTS (
              SELECT 1
              FROM public.game_state_sets s
              WHERE s.game_id = g.id
                AND (
                  s.phase <> 'preparation'
                  OR s.frozen_at IS NOT NULL
                )
            )
          )
      )
    THEN
      RAISE EXCEPTION
        'Historical or noneditable KPI meaning cannot change';
    END IF;

    IF NEW.value_type = 'numeric' THEN
      IF EXISTS (
        SELECT 1
        FROM public.game_state_values v
        WHERE v.kpi_definition_id = OLD.id
          AND (
            v.ordinal_key IS NOT NULL
            OR v.value IS NULL
            OR v.value::text IN ('NaN', 'Infinity', '-Infinity')
            OR abs(v.value) >= 1000000000000000000000000::numeric
            OR v.value <> round(v.value, NEW.precision)
            OR (
              v.value < 0
              AND NOT NEW.allows_negative
            )
          )
      )
      THEN
        RAISE EXCEPTION
          'Existing preparation values are incompatible with the numeric KPI definition';
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.game_state_values v
        WHERE v.kpi_definition_id = OLD.id
          AND (
            v.value IS NOT NULL
            OR v.ordinal_key IS NULL
          )
      )
      THEN
        RAISE EXCEPTION
          'Existing preparation values are incompatible with the ordinal KPI definition';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

--> statement-breakpoint

-- A state value must use the storage column that matches its KPI type.
CREATE OR REPLACE FUNCTION public.guard_game_state_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target public.game_state_sets%ROWTYPE;
  definition public.kpi_definitions%ROWTYPE;
  target_id uuid;
  game_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.state_set_id;
  ELSE
    target_id := NEW.state_set_id;
  END IF;

  IF TG_OP = 'UPDATE'
    AND ROW(
      NEW.id,
      NEW.state_set_id,
      NEW.game_id,
      NEW.kpi_definition_id,
      NEW.campaign_id,
      NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.state_set_id,
      OLD.game_id,
      OLD.kpi_definition_id,
      OLD.campaign_id,
      OLD.created_at
    )
  THEN
    RAISE EXCEPTION
      'State value identity is immutable';
  END IF;

  SELECT *
  INTO target
  FROM public.game_state_sets
  WHERE id = target_id
  FOR UPDATE;

  IF NOT FOUND
    OR target.frozen_at IS NOT NULL
  THEN
    RAISE EXCEPTION
      'State is missing or frozen';
  END IF;

  IF target.phase = 'preparation' THEN
    SELECT status::text
    INTO game_status
    FROM public.games
    WHERE id = target.game_id;

    IF game_status NOT IN ('draft', 'ready') THEN
      RAISE EXCEPTION
        'Preparation cannot change after the game begins';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT *
  INTO definition
  FROM public.kpi_definitions
  WHERE id = NEW.kpi_definition_id
  FOR UPDATE;

  IF NOT FOUND
    OR definition.campaign_id <> target.campaign_id
    OR NEW.campaign_id <> target.campaign_id
  THEN
    RAISE EXCEPTION
      'KPI and state must belong to the same campaign';
  END IF;

  IF definition.value_type = 'numeric' THEN
    IF NEW.value IS NULL
      OR NEW.ordinal_key IS NOT NULL
      OR NEW.value::text IN ('NaN', 'Infinity', '-Infinity')
      OR abs(NEW.value) >= 1000000000000000000000000::numeric
      OR NEW.value <> round(NEW.value, definition.precision)
      OR (
        NEW.value < 0
        AND NOT definition.allows_negative
      )
    THEN
      RAISE EXCEPTION
        'Value violates the KPI numeric definition';
    END IF;
  ELSE
    IF NEW.value IS NOT NULL
      OR NEW.ordinal_key IS NULL
    THEN
      RAISE EXCEPTION
        'Value violates the KPI ordinal definition';
    END IF;

    PERFORM 1
    FROM public.kpi_ordinal_options o
    WHERE o.kpi_definition_id = definition.id
      AND o.key = NEW.ordinal_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Ordinal value is not a valid option for this KPI';
    END IF;
  END IF;

  IF definition.used_at IS NULL THEN
    UPDATE public.kpi_definitions
    SET used_at = now()
    WHERE id = definition.id;
  END IF;

  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

--> statement-breakpoint

-- Ordinal options are part of KPI semantics.
CREATE FUNCTION public.guard_kpi_ordinal_option()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  definition public.kpi_definitions%ROWTYPE;
  definition_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    definition_id := OLD.kpi_definition_id;
  ELSE
    definition_id := NEW.kpi_definition_id;
  END IF;

  SELECT *
  INTO definition
  FROM public.kpi_definitions
  WHERE id = definition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'KPI definition does not exist';
  END IF;

  IF definition.historical_used_at IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.game_kpis k
      JOIN public.games g
        ON g.id = k.game_id
      WHERE k.kpi_definition_id = definition.id
        AND (
          k.historical_used_at IS NOT NULL
          OR g.status NOT IN ('draft', 'ready')
          OR EXISTS (
            SELECT 1
            FROM public.game_state_sets s
            WHERE s.game_id = g.id
              AND (
                s.phase <> 'preparation'
                OR s.frozen_at IS NOT NULL
              )
          )
        )
    )
  THEN
    RAISE EXCEPTION
      'Historical or noneditable KPI options cannot change';
  END IF;

  IF TG_OP = 'UPDATE'
    AND ROW(
      NEW.kpi_definition_id,
      NEW.key
    ) IS DISTINCT FROM ROW(
      OLD.kpi_definition_id,
      OLD.key
    )
  THEN
    RAISE EXCEPTION
      'Ordinal option identity is immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF definition.value_type <> 'ordinal' THEN
    RAISE EXCEPTION
      'Only ordinal KPIs may define ordinal options';
  END IF;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE TRIGGER kpi_ordinal_options_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.kpi_ordinal_options
FOR EACH ROW
EXECUTE FUNCTION public.guard_kpi_ordinal_option();

--> statement-breakpoint

REVOKE ALL ON FUNCTION
  public.guard_kpi_definition(),
  public.guard_game_state_value(),
  public.guard_kpi_ordinal_option()
FROM PUBLIC, anon, authenticated;