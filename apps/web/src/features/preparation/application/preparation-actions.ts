"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { getGameDetail } from "@/features/games/application/get-game-detail";

import {
  canWritePreparation,
  PreparationError,
  UUID_PATTERN,
  validateDefinition,
  type DefinitionInput,
  type KpiValueType,
  type OrdinalOption,
} from "../domain/preparation";

import {
  writePreparation,
} from "../repositories/preparation.repository";

import {
  mutateKpi,
  type KpiMutation,
} from "../repositories/kpi-management.repository";

export type PreparationActionState = {
  error?: string;
  success?: string;
};

function text(
  form: FormData,
  key: string
): string {
  const value = form.get(key);

  if (typeof value !== "string") {
    throw new PreparationError(
      "Los datos enviados no son válidos."
    );
  }

  return value;
}

function optionalText(
  form: FormData,
  key: string,
  fallback = ""
): string {
  const value = form.get(key);

  if (value === null) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new PreparationError(
      "Los datos enviados no son válidos."
    );
  }

  return value;
}

function valueTypeFromForm(
  form: FormData
): KpiValueType {
  const value =
    optionalText(
      form,
      "valueType",
      "numeric"
    );

  if (
    value !== "numeric" &&
    value !== "ordinal"
  ) {
    throw new PreparationError(
      "El tipo de KPI no es válido."
    );
  }

  return value;
}

function ordinalOptionsFromForm(
  form: FormData,
  valueType: KpiValueType
): OrdinalOption[] {
  if (
    valueType !== "ordinal"
  ) {
    return [];
  }

  const raw =
    text(
      form,
      "ordinalOptions"
    );

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(raw);
  } catch {
    throw new PreparationError(
      "Las opciones del KPI por niveles no son válidas."
    );
  }

  if (!Array.isArray(parsed)) {
    throw new PreparationError(
      "Las opciones del KPI por niveles no son válidas."
    );
  }

  return parsed.map(
    (item): OrdinalOption => {
      if (
        typeof item !== "object" ||
        item === null
      ) {
        throw new PreparationError(
          "Una opción del KPI por niveles no es válida."
        );
      }

      const candidate =
        item as Record<
          string,
          unknown
        >;

      if (
        typeof candidate.key !==
          "string" ||
        typeof candidate.label !==
          "string" ||
        typeof candidate.position !==
          "number"
      ) {
        throw new PreparationError(
          "Una opción del KPI por niveles no es válida."
        );
      }

      return {
        key: candidate.key,
        label: candidate.label,
        position:
          candidate.position,
      };
    }
  );
}

function definitionFromForm(
  form: FormData,
  requiredField:
    | "required"
    | "defaultRequired"
): DefinitionInput {
  const valueType =
    valueTypeFromForm(form);

  let precision = 0;

  if (
    valueType === "numeric"
  ) {
    const rawPrecision =
      text(
        form,
        "precision"
      );

    if (
      !/^[0-6]$/.test(
        rawPrecision
      )
    ) {
      throw new PreparationError(
        "La precisión debe estar entre 0 y 6."
      );
    }

    precision =
      Number(rawPrecision);
  }

  return {
    key:
      text(form, "key"),

    name:
      text(form, "name"),

    unit:
      text(form, "unit"),

    precision,

    required:
      form.get(
        requiredField
      ) === "on",

    allowsNegative:
      valueType === "numeric" &&
      form.get(
        "allowsNegative"
      ) === "on",

    valueType,

    ordinalOptions:
      ordinalOptionsFromForm(
        form,
        valueType
      ),
  };
}

async function authorize(
  gameId: string
) {
  if (
    !UUID_PATTERN.test(gameId)
  ) {
    throw new PreparationError(
      "La partida no es válida."
    );
  }

  const actorId =
    await getAuthenticatedUserId();

  if (!actorId) {
    throw new PreparationError(
      "Tu sesión no es válida. Volvé a iniciar sesión."
    );
  }

  const result =
    await getGameDetail(
      gameId
    );

  if (
    result.status !== "found" ||
    !canWritePreparation(
      result.memberRole
    )
  ) {
    throw new PreparationError(
      "No tenés permiso para modificar esta preparación."
    );
  }

  return actorId;
}

function failure(
  error: unknown
): PreparationActionState {
  if (
    error instanceof
    PreparationError
  ) {
    return {
      error:
        error.message,
    };
  }

  console.error(
    "Error de configuración inicial:",
    error
  );

  return {
    error:
      "No se pudo guardar la configuración. Si el problema persiste, recargá los datos.",
  };
}

export async function createKpiAction(
  _previous:
    PreparationActionState,
  form: FormData
): Promise<PreparationActionState> {
  let gameId: string;

  try {
    gameId =
      text(
        form,
        "gameId"
      );

    const actorId =
      await authorize(
        gameId
      );

    const input =
      validateDefinition(
        definitionFromForm(
          form,
          "required"
        )
      );

    await mutateKpi(
      actorId,
      {
        ...mutationMetadata(
          form
        ),

        gameId,

        operation:
          "create_kpi",

        definition:
          input,
      }
    );
  } catch (error) {
    return failure(
      error
    );
  }

  revalidatePath(
    `/master/partidas/${gameId}`
  );

  return {
    success:
      "KPI agregado a la campaña y asociado a esta partida.",
  };
}

export async function savePreparationAction(
  _previous:
    PreparationActionState,
  form: FormData
): Promise<PreparationActionState> {
  let gameId: string;

  try {
    gameId =
      text(
        form,
        "gameId"
      );

    const actorId =
      await authorize(
        gameId
      );

    const operationId =
      text(
        form,
        "operationId"
      );

    const revision =
      text(
        form,
        "revision"
      );

    const token =
      text(
        form,
        "catalogToken"
      );

    const operation =
      text(
        form,
        "operation"
      );

    if (
      !UUID_PATTERN.test(
        operationId
      ) ||
      !/^\d+$/.test(
        revision
      ) ||
      !Number.isSafeInteger(
        Number(revision)
      ) ||
      Number(revision) >=
        2147483647 ||
      !/^[0-9a-f]{64}$/.test(
        token
      ) ||
      (
        operation !==
          "save_values" &&
        operation !==
          "copy_snapshot"
      )
    ) {
      throw new PreparationError(
        "Los datos de la operación no son válidos. Recargá la página."
      );
    }

    const entries = [
      ...form.entries(),
    ].filter(
      ([key]) =>
        key.startsWith(
          "value:"
        )
    );

    if (
      entries.some(
        ([key, value]) =>
          !UUID_PATTERN.test(
            key.slice(6)
          ) ||
          typeof value !==
            "string"
      ) ||
      new Set(
        entries.map(
          ([key]) => key
        )
      ).size !==
        entries.length
    ) {
      throw new PreparationError(
        "Los valores enviados no son válidos."
      );
    }

    const sourceId =
      operation ===
      "copy_snapshot"
        ? text(
            form,
            "sourceId"
          )
        : null;

    if (
      sourceId !== null &&
      !UUID_PATTERN.test(
        sourceId
      )
    ) {
      throw new PreparationError(
        "Seleccioná un snapshot válido."
      );
    }

    if (
      operation ===
        "copy_snapshot" &&
      form.get(
        "confirmCopy"
      ) !== "on"
    ) {
      throw new PreparationError(
        "Confirmá que querés reemplazar los valores por los del snapshot."
      );
    }

    await writePreparation(
      actorId,
      {
        gameId,
        operationId,

        expectedRevision:
          Number(
            revision
          ),

        catalogToken:
          token,

        operation,

        sourceId,

        values:
          Object.fromEntries(
            entries.map(
              ([key, value]) => [
                key.slice(6),
                value as string,
              ]
            )
          ),
      }
    );
  } catch (error) {
    return failure(
      error
    );
  }

  revalidatePath(
    `/master/partidas/${gameId}`
  );

  return {
    success:
      "Preparación guardada.",
  };
}

function mutationMetadata(
  form: FormData
) {
  const operationId =
    text(
      form,
      "operationId"
    );

  const revision =
    text(
      form,
      "revision"
    );

  const catalogToken =
    text(
      form,
      "catalogToken"
    );

  if (
    !UUID_PATTERN.test(
      operationId
    ) ||
    !/^\d+$/.test(
      revision
    ) ||
    !Number.isSafeInteger(
      Number(revision)
    ) ||
    Number(revision) >=
      2147483647 ||
    !/^[0-9a-f]{64}$/.test(
      catalogToken
    )
  ) {
    throw new PreparationError(
      "La operación no es válida. Recargá los datos."
    );
  }

  return {
    operationId,

    expectedRevision:
      Number(revision),

    catalogToken,
  };
}

export async function manageKpiAction(
  _previous:
    PreparationActionState,
  form: FormData
): Promise<PreparationActionState> {
  try {
    const gameId =
      text(
        form,
        "gameId"
      );

    const actorId =
      await authorize(
        gameId
      );

    const kpiId =
      text(
        form,
        "kpiId"
      );

    const operation =
      text(
        form,
        "operation"
      );

    if (
      !UUID_PATTERN.test(
        kpiId
      ) ||
      ![
        "add_kpi",
        "remove_kpi",
        "set_required",
        "edit_kpi",
        "delete_kpi",
      ].includes(
        operation
      )
    ) {
      throw new PreparationError(
        "La operación no es válida."
      );
    }

    const input:
      KpiMutation = {
        ...mutationMetadata(
          form
        ),

        gameId,
        kpiId,

        operation:
          operation as
            KpiMutation["operation"],

        required:
          form.get(
            "required"
          ) === "on",

        confirmed:
          form.get(
            "confirmed"
          ) === "on",
      };

    if (
      operation ===
      "edit_kpi"
    ) {
      input.definition =
        validateDefinition(
          definitionFromForm(
            form,
            "defaultRequired"
          )
        );
    }

    await mutateKpi(
      actorId,
      input
    );

    revalidatePath(
      "/master/partidas/[id]",
      "page"
    );

    return {
      success:
        "Configuración de KPI guardada.",
    };
  } catch (error) {
    return failure(
      error
    );
  }
}