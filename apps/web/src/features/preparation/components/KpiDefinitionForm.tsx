"use client";

import {
  useActionState,
  useRef,
  useState,
} from "react";

import {
  createKpiAction,
  type PreparationActionState,
} from "../application/preparation-actions";

type ValueType =
  | "numeric"
  | "ordinal";

type OrdinalOption = {
  key: string;
  label: string;
  position: number;
};

type KpiFields = {
  key: string;
  name: string;
  unit: string;
  precision: string;
  valueType: ValueType;
  ordinalOptions: OrdinalOption[];
};

type KpiPreset =
  KpiFields & {
    label: string;
  };

const inventoryOptions: OrdinalOption[] = [
  {
    key: "critical",
    label: "Crítico",
    position: 0,
  },
  {
    key: "low",
    label: "Bajo",
    position: 1,
  },
  {
    key: "medium",
    label: "Medio",
    position: 2,
  },
  {
    key: "high",
    label: "Alto",
    position: 3,
  },
  {
    key: "overstock",
    label: "Sobrestock",
    position: 4,
  },
];

const presets: KpiPreset[] = [
  {
    key: "cash_available",
    label: "Fondos disponibles",
    name: "Fondos disponibles",
    unit: "ARS",
    precision: "2",
    valueType: "numeric",
    ordinalOptions: [],
  },
  {
    key: "lead_time",
    label: "Lead Time",
    name: "Lead Time",
    unit: "semanas",
    precision: "1",
    valueType: "numeric",
    ordinalOptions: [],
  },
  {
    key: "inventory_level",
    label: "Inventario",
    name: "Inventario",
    unit: "nivel",
    precision: "0",
    valueType: "ordinal",
    ordinalOptions:
      inventoryOptions,
  },
];

const initial: PreparationActionState = {};

const emptyFields: KpiFields = {
  key: "",
  name: "",
  unit: "",
  precision: "2",
  valueType: "numeric",
  ordinalOptions: [],
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white focus:outline-2 focus:outline-sky-400";

export function KpiDefinitionForm({
  gameId,
  revision,
  catalogToken,
}: {
  gameId: string;
  revision: number;
  catalogToken: string;
}) {
  const operationId =
    useRef<string | null>(
      null
    );

  const [
    state,
    action,
    pending,
  ] = useActionState(
    createKpiAction,
    initial
  );

  const [
    selectedPreset,
    setSelectedPreset,
  ] = useState("");

  const [
    fields,
    setFields,
  ] =
    useState<KpiFields>(
      emptyFields
    );

  const isCustom =
    selectedPreset ===
    "custom";

  function handlePresetChange(
    value: string
  ) {
    setSelectedPreset(
      value
    );

    if (
      value === "custom"
    ) {
      setFields({
        ...emptyFields,
      });

      return;
    }

    const preset =
      presets.find(
        (item) =>
          item.key === value
      );

    if (!preset) {
      setFields({
        ...emptyFields,
      });

      return;
    }

    setFields({
      key: preset.key,
      name: preset.name,
      unit: preset.unit,
      precision:
        preset.precision,
      valueType:
        preset.valueType,

      ordinalOptions:
        preset.ordinalOptions.map(
          (option) => ({
            ...option,
          })
        ),
    });
  }

  function changeValueType(
    valueType: ValueType
  ) {
    setFields(
      (current) => ({
        ...current,
        valueType,

        precision:
          valueType ===
          "numeric"
            ? current.precision ||
              "2"
            : "0",

        ordinalOptions:
          valueType ===
          "ordinal"
            ? current.ordinalOptions.length
              ? current.ordinalOptions
              : [
                  {
                    key: "low",
                    label: "Bajo",
                    position: 0,
                  },
                  {
                    key: "high",
                    label: "Alto",
                    position: 1,
                  },
                ]
            : [],
      })
    );
  }

  function updateOrdinalOption(
    index: number,
    field:
      | "key"
      | "label",
    value: string
  ) {
    setFields(
      (current) => ({
        ...current,

        ordinalOptions:
          current.ordinalOptions.map(
            (
              option,
              optionIndex
            ) =>
              optionIndex ===
              index
                ? {
                    ...option,
                    [field]:
                      value,
                  }
                : option
          ),
      })
    );
  }

  function addOrdinalOption() {
    setFields(
      (current) => ({
        ...current,

        ordinalOptions: [
          ...current.ordinalOptions,
          {
            key: "",
            label: "",
            position:
              current
                .ordinalOptions
                .length,
          },
        ],
      })
    );
  }

  function removeOrdinalOption(
    index: number
  ) {
    setFields(
      (current) => ({
        ...current,

        ordinalOptions:
          current.ordinalOptions
            .filter(
              (
                _option,
                optionIndex
              ) =>
                optionIndex !==
                index
            )
            .map(
              (
                option,
                position
              ) => ({
                ...option,
                position,
              })
            ),
      })
    );
  }

  return (
    <details className="mt-6 rounded-2xl border border-white/10 p-5">
      <summary className="cursor-pointer font-bold">
        Crear KPI y agregarlo a esta partida
      </summary>

      <p className="mt-3 text-sm text-slate-400">
        La definición queda disponible
        en el catálogo de la campaña,
        pero se asocia inicialmente solo
        a esta partida.
      </p>

      <form
        action={action}
        onChange={() => {
          operationId.current =
            null;
        }}
        onSubmit={(
          event
        ) => {
          operationId.current ??=
            crypto.randomUUID();

          const input =
            event.currentTarget.elements.namedItem(
              "operationId"
            ) as HTMLInputElement;

          input.value =
            operationId.current;
        }}
        className="mt-5 space-y-4"
      >
        <input
          type="hidden"
          name="gameId"
          value={gameId}
        />

        <input
          type="hidden"
          name="operationId"
          defaultValue=""
        />

        <input
          type="hidden"
          name="revision"
          value={revision}
        />

        <input
          type="hidden"
          name="catalogToken"
          value={catalogToken}
        />

        <input
          type="hidden"
          name="valueType"
          value={
            fields.valueType
          }
        />

        <input
          type="hidden"
          name="ordinalOptions"
          value={JSON.stringify(
            fields.ordinalOptions
          )}
        />

        <label className="block text-sm">
          KPI

          <select
            value={
              selectedPreset
            }
            onChange={(event) =>
              handlePresetChange(
                event.target.value
              )
            }
            className={`${inputClass} mt-1`}
          >
            <option value="">
              Seleccionar...
            </option>

            {presets.map(
              (preset) => (
                <option
                  key={
                    preset.key
                  }
                  value={
                    preset.key
                  }
                >
                  {
                    preset.label
                  }
                </option>
              )
            )}

            <option value="custom">
              + KPI personalizado
            </option>
          </select>
        </label>

        {selectedPreset && (
          <>
            {isCustom && (
              <label className="block text-sm">
                Tipo de valor

                <select
                  value={
                    fields.valueType
                  }
                  onChange={(
                    event
                  ) =>
                    changeValueType(
                      event.target
                        .value as ValueType
                    )
                  }
                  className={`${inputClass} mt-1`}
                >
                  <option value="numeric">
                    Numérico
                  </option>

                  <option value="ordinal">
                    Por niveles
                  </option>
                </select>
              </label>
            )}

            {!isCustom && (
              <p className="text-sm text-slate-400">
                Tipo:{" "}
                {fields.valueType ===
                "numeric"
                  ? "Numérico"
                  : "Por niveles"}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                Clave estable

                <input
                  name="key"
                  required
                  value={
                    fields.key
                  }
                  maxLength={64}
                  readOnly={
                    !isCustom
                  }
                  onChange={(
                    event
                  ) =>
                    setFields({
                      ...fields,
                      key: event
                        .target
                        .value,
                    })
                  }
                  className={`${inputClass} mt-1 ${
                    !isCustom
                      ? "cursor-not-allowed text-slate-400"
                      : ""
                  }`}
                />

                {!isCustom && (
                  <span className="mt-1 block text-xs text-slate-500">
                    Se genera
                    automáticamente
                    para evitar
                    inconsistencias.
                  </span>
                )}
              </label>

              <label className="block text-sm">
                Nombre

                <input
                  name="name"
                  required
                  value={
                    fields.name
                  }
                  maxLength={120}
                  onChange={(
                    event
                  ) =>
                    setFields({
                      ...fields,
                      name: event
                        .target
                        .value,
                    })
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>

              <label className="block text-sm">
                Unidad / escala

                <input
                  name="unit"
                  required
                  value={
                    fields.unit
                  }
                  maxLength={40}
                  onChange={(
                    event
                  ) =>
                    setFields({
                      ...fields,
                      unit: event
                        .target
                        .value,
                    })
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>

              {fields.valueType ===
                "numeric" && (
                <label className="block text-sm">
                  Decimales permitidos

                  <input
                    name="precision"
                    type="number"
                    min={0}
                    max={6}
                    step={1}
                    required
                    value={
                      fields.precision
                    }
                    onChange={(
                      event
                    ) =>
                      setFields({
                        ...fields,

                        precision:
                          event
                            .target
                            .value,
                      })
                    }
                    className={`${inputClass} mt-1`}
                  />
                </label>
              )}
            </div>

            {fields.valueType ===
              "ordinal" && (
              <div className="space-y-3 rounded-xl border border-white/10 p-4">
                <div>
                  <p className="font-bold">
                    Niveles
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Se guardan con
                    una clave estable,
                    pero el usuario ve
                    la etiqueta.
                  </p>
                </div>

                {fields.ordinalOptions.map(
                  (
                    option,
                    index
                  ) => (
                    <div
                      key={
                        index
                      }
                      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <input
                        value={
                          option.key
                        }
                        readOnly={
                          !isCustom
                        }
                        required
                        placeholder="clave"
                        className={`${inputClass} ${
                          !isCustom
                            ? "cursor-not-allowed text-slate-400"
                            : ""
                        }`}
                        onChange={(
                          event
                        ) =>
                          updateOrdinalOption(
                            index,
                            "key",
                            event
                              .target
                              .value
                          )
                        }
                      />

                      <input
                        value={
                          option.label
                        }
                        readOnly={
                          !isCustom
                        }
                        required
                        placeholder="Etiqueta"
                        className={`${inputClass} ${
                          !isCustom
                            ? "cursor-not-allowed text-slate-400"
                            : ""
                        }`}
                        onChange={(
                          event
                        ) =>
                          updateOrdinalOption(
                            index,
                            "label",
                            event
                              .target
                              .value
                          )
                        }
                      />

                      {isCustom && (
                        <button
                          type="button"
                          onClick={() =>
                            removeOrdinalOption(
                              index
                            )
                          }
                          className="rounded-xl border border-red-400/30 px-3 py-2 text-sm text-red-300"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  )
                )}

                {isCustom && (
                  <button
                    type="button"
                    onClick={
                      addOrdinalOption
                    }
                    className="rounded-xl border border-white/10 px-3 py-2 text-sm"
                  >
                    + Agregar nivel
                  </button>
                )}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  name="required"
                  type="checkbox"
                />

                Obligatorio
              </label>

              {fields.valueType ===
                "numeric" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    name="allowsNegative"
                    type="checkbox"
                  />

                  Permitir valores
                  negativos
                </label>
              )}
            </div>

            {fields.key ===
              "inventory_level" && (
              <p className="text-xs text-slate-400">
                Inventario se
                registra como nivel:
                Crítico, Bajo,
                Medio, Alto o
                Sobrestock. No se
                convierte a números.
              </p>
            )}

            {state.error && (
              <p
                role="alert"
                className="text-sm text-red-300"
              >
                {state.error}
              </p>
            )}

            {state.success && (
              <p
                role="status"
                className="text-sm text-emerald-300"
              >
                {state.success}
              </p>
            )}

            <button
              disabled={
                pending
              }
              className="rounded-xl bg-white px-4 py-2 font-bold text-slate-950 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {pending
                ? "Guardando..."
                : "Agregar KPI"}
            </button>
          </>
        )}
      </form>
    </details>
  );
}