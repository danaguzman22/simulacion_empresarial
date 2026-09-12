export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PreparationError extends Error {}

export type KpiValueType =
  | "numeric"
  | "ordinal";

export type OrdinalOption = {
  key: string;
  label: string;
  position: number;
};

export function canReadPreparation(
  role: string
): boolean {
  return (
    role === "master" ||
    role === "co_master" ||
    role === "observer"
  );
}

export function canWritePreparation(
  role: string
): boolean {
  return (
    role === "master" ||
    role === "co_master"
  );
}

export function isPreparationEditable(
  status: string,
  frozenAt: Date | null
): boolean {
  return (
    (status === "draft" ||
      status === "ready") &&
    frozenAt === null
  );
}

type ValueDefinition = {
  name: string;
  precision: number;
  allowsNegative: boolean;

  /*
   * Opcionales por compatibilidad con el código
   * actual. Si no viene valueType, se considera
   * numeric.
   */
  valueType?: KpiValueType;

  ordinalOptions?: ReadonlyArray<{
    key: string;
    label: string;
    position: number;
  }>;
};

/*
 * Mantener los números como strings decimales
 * exactos. Nunca redondear usando Number.
 *
 * Para un KPI ordinal devolvemos la clave estable
 * de la opción:
 *
 * "critical"
 * "low"
 * "medium"
 * ...
 */
export function normalizeValue(
  raw: string,
  definition: ValueDefinition
): string | null {
  const input = raw.trim();

  if (!input) {
    return null;
  }

  const valueType =
    definition.valueType ??
    "numeric";

  /*
   * KPI POR NIVELES
   */
  if (valueType === "ordinal") {
    const option =
      definition.ordinalOptions?.find(
        (item) =>
          item.key === input
      );

    if (!option) {
      throw new PreparationError(
        `Seleccioná un nivel válido para ${definition.name}.`
      );
    }

    return option.key;
  }

  /*
   * KPI NUMÉRICO
   */
  const normalized =
    input.replace(",", ".");

  if (
    !/^-?\d+(\.\d+)?$/.test(
      normalized
    )
  ) {
    throw new PreparationError(
      `Ingresá un número sin separadores de miles para ${definition.name}.`
    );
  }

  const negative =
    normalized.startsWith("-");

  const [
    whole,
    fraction = "",
  ] = normalized
    .replace(/^-/, "")
    .split(".");

  const integer =
    whole.replace(
      /^0+(?=\d)/,
      ""
    );

  const decimals =
    fraction.replace(
      /0+$/,
      ""
    );

  if (
    integer.length > 24 ||
    decimals.length >
      definition.precision
  ) {
    throw new PreparationError(
      `${definition.name}: máximo 24 dígitos enteros y ${definition.precision} decimales.`
    );
  }

  const isZero =
    integer === "0" &&
    !decimals;

  if (
    negative &&
    !isZero &&
    !definition.allowsNegative
  ) {
    throw new PreparationError(
      `${definition.name} no permite valores negativos.`
    );
  }

  return (
    (negative && !isZero
      ? "-"
      : "") +
    integer +
    (decimals
      ? "." + decimals
      : "")
  );
}

/*
 * Por ahora mantenemos DefinitionInput compatible
 * con la gestión numérica existente.
 *
 * En el siguiente paso lo extenderemos para la
 * creación/edición de KPIs ordinales.
 */
export type DefinitionInput = {
  key: string;
  name: string;
  unit: string;
  precision: number;
  required: boolean;
  allowsNegative: boolean;

  /*
   * Opcionales para conservar compatibilidad
   * con formularios numéricos existentes.
   */
  valueType?: KpiValueType;
  ordinalOptions?: OrdinalOption[];
};

export type ValidatedDefinition = {
  key: string;
  name: string;
  unit: string;
  precision: number;
  required: boolean;
  allowsNegative: boolean;
  valueType: KpiValueType;
  ordinalOptions: OrdinalOption[];
};

export function validateDefinition(
  input: DefinitionInput
): ValidatedDefinition {
  const valueType =
    input.valueType ?? "numeric";

  const result: ValidatedDefinition = {
    key: input.key.trim(),
    name: input.name.trim(),
    unit: input.unit.trim(),
    precision: input.precision,
    required: input.required,
    allowsNegative:
      valueType === "numeric"
        ? input.allowsNegative
        : false,
    valueType,
    ordinalOptions:
      valueType === "ordinal"
        ? (input.ordinalOptions ?? []).map(
            (option) => ({
              key: option.key.trim(),
              label: option.label.trim(),
              position: option.position,
            })
          )
        : [],
  };

  if (
    !/^[a-z][a-z0-9_]{0,63}$/.test(
      result.key
    )
  ) {
    throw new PreparationError(
      "La clave debe comenzar con una letra minúscula y contener solo letras minúsculas, números o guion bajo (máximo 64)."
    );
  }

  if (
    !result.name ||
    result.name.length > 120 ||
    !result.unit ||
    result.unit.length > 40
  ) {
    throw new PreparationError(
      "Completá nombre (hasta 120 caracteres) y unidad (hasta 40)."
    );
  }

  if (
    valueType === "numeric"
  ) {
    if (
      !Number.isInteger(
        result.precision
      ) ||
      result.precision < 0 ||
      result.precision > 6
    ) {
      throw new PreparationError(
        "La precisión debe estar entre 0 y 6 decimales."
      );
    }

    return result;
  }

  /*
   * Para ordinales, precisión y negativos
   * no tienen significado.
   */
  result.precision = 0;
  result.allowsNegative = false;

  if (
    result.ordinalOptions.length < 2
  ) {
    throw new PreparationError(
      "Un KPI por niveles debe tener al menos dos opciones."
    );
  }

  const keys = new Set<string>();
  const positions = new Set<number>();

  for (
    const option of
    result.ordinalOptions
  ) {
    if (
      !/^[a-z][a-z0-9_]{0,63}$/.test(
        option.key
      )
    ) {
      throw new PreparationError(
        `La clave "${option.key}" de una opción no es válida.`
      );
    }

    if (
      !option.label ||
      option.label.length > 120
    ) {
      throw new PreparationError(
        "Cada nivel debe tener una etiqueta de hasta 120 caracteres."
      );
    }

    if (
      !Number.isInteger(
        option.position
      ) ||
      option.position < 0
    ) {
      throw new PreparationError(
        "La posición de cada nivel debe ser un entero no negativo."
      );
    }

    if (
      keys.has(option.key)
    ) {
      throw new PreparationError(
        `La opción "${option.key}" está repetida.`
      );
    }

    if (
      positions.has(
        option.position
      )
    ) {
      throw new PreparationError(
        "Dos niveles no pueden ocupar la misma posición."
      );
    }

    keys.add(option.key);
    positions.add(
      option.position
    );
  }

  result.ordinalOptions.sort(
    (a, b) =>
      a.position -
      b.position
  );

  return result;
}
