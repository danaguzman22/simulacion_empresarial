"use client";

import {
  useActionState,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  manageKpiAction,
} from "../application/preparation-actions";

import type {
  PreparationData,
} from "./PreparationForm";

const field =
  "w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white";

type CatalogKpi =
  PreparationData["catalog"][number];

type ValueType =
  | "numeric"
  | "ordinal";

type OrdinalOption = {
  key: string;
  label: string;
  position: number;
};

function Operation({
  gameId,
  data,
  kpiId,
  operation,
  children,
  label,
}: {
  gameId: string;
  data: PreparationData;
  kpiId: string;
  operation: string;
  children?: ReactNode;
  label: string;
}) {
  const [
    state,
    action,
    pending,
  ] = useActionState(
    manageKpiAction,
    {}
  );

  const id =
    useRef<string | null>(
      null
    );

  return (
    <form
      action={action}
      className="mt-3 space-y-3"
      onChange={() => {
        id.current = null;
      }}
      onSubmit={(
        event
      ) => {
        id.current ??=
          crypto.randomUUID();

        const input =
          event.currentTarget.elements.namedItem(
            "operationId"
          ) as HTMLInputElement;

        input.value =
          id.current;
      }}
    >
      <input
        type="hidden"
        name="gameId"
        value={gameId}
      />

      <input
        type="hidden"
        name="kpiId"
        value={kpiId}
      />

      <input
        type="hidden"
        name="operation"
        value={operation}
      />

      <input
        type="hidden"
        name="operationId"
        defaultValue=""
      />

      <input
        type="hidden"
        name="revision"
        value={data.revision}
      />

      <input
        type="hidden"
        name="catalogToken"
        value={
          data.catalogToken
        }
      />

      <fieldset
        disabled={pending}
        className="space-y-3"
      >
        {children}

        <button
          className="rounded-xl bg-white px-3 py-2 font-bold text-slate-950 disabled:opacity-50"
          disabled={pending}
        >
          {pending
            ? "Guardando…"
            : label}
        </button>
      </fieldset>

      {state.error && (
        <div
          role="alert"
          className="text-sm text-red-300"
        >
          <p>
            {state.error}
          </p>

          <button
            type="button"
            className="underline"
            onClick={() =>
              window.location.reload()
            }
          >
            Recargar datos
            (descarta cambios sin
            guardar)
          </button>
        </div>
      )}

      {state.success && (
        <p
          role="status"
          className="text-sm text-emerald-300"
        >
          {state.success}
        </p>
      )}
    </form>
  );
}

function Editor({
  kpi,
  gameId,
  data,
}: {
  kpi: CatalogKpi;
  gameId: string;
  data: PreparationData;
}) {
  const [
    valueType,
    setValueType,
  ] = useState<ValueType>(
    kpi.valueType
  );

  const [
    ordinalOptions,
    setOrdinalOptions,
  ] = useState<
    OrdinalOption[]
  >(
    kpi.ordinalOptions.map(
      (option) => ({
        ...option,
      })
    )
  );

  function changeType(
    nextType: ValueType
  ) {
    setValueType(
      nextType
    );

    if (
      nextType ===
        "ordinal" &&
      ordinalOptions.length ===
        0
    ) {
      setOrdinalOptions([
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
      ]);
    }
  }

  function updateOption(
    index: number,
    property:
      | "key"
      | "label",
    value: string
  ) {
    setOrdinalOptions(
      (current) =>
        current.map(
          (
            option,
            optionIndex
          ) =>
            optionIndex ===
            index
              ? {
                  ...option,
                  [property]:
                    value,
                }
              : option
        )
    );
  }

  function addOption() {
    setOrdinalOptions(
      (current) => [
        ...current,
        {
          key: "",
          label: "",
          position:
            current.length,
        },
      ]
    );
  }

  function removeOption(
    index: number
  ) {
    setOrdinalOptions(
      (current) =>
        current
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
          )
    );
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sky-300">
        Editar definición
      </summary>

      <Operation
        gameId={gameId}
        data={data}
        kpiId={kpi.id}
        operation="edit_kpi"
        label="Guardar definición"
      >
        <input
          type="hidden"
          name="valueType"
          value={valueType}
        />

        <input
          type="hidden"
          name="ordinalOptions"
          value={JSON.stringify(
            ordinalOptions
          )}
        />

        <p className="text-sm text-amber-300">
          Esta definición puede
          estar asociada a{" "}
          {kpi.associationCount}{" "}
          partida(s). Los cambios
          semánticos requieren
          revisar sus valores.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            Clave

            <input
              className={field}
              name="key"
              defaultValue={
                kpi.key
              }
              required
              maxLength={64}
            />
          </label>

          <label>
            Nombre

            <input
              className={field}
              name="name"
              defaultValue={
                kpi.name
              }
              required
              maxLength={120}
            />
          </label>

          <label>
            Unidad / escala

            <input
              className={field}
              name="unit"
              defaultValue={
                kpi.unit
              }
              required
              maxLength={40}
            />
          </label>

          <label>
            Tipo de valor

            <select
              className={field}
              value={
                valueType
              }
              onChange={(
                event
              ) =>
                changeType(
                  event.target
                    .value as ValueType
                )
              }
            >
              <option value="numeric">
                Numérico
              </option>

              <option value="ordinal">
                Por niveles
              </option>
            </select>
          </label>

          {valueType ===
            "numeric" && (
            <label>
              Decimales permitidos

              <input
                className={
                  field
                }
                name="precision"
                type="number"
                min={0}
                max={6}
                step={1}
                required
                defaultValue={
                  kpi.precision
                }
              />
            </label>
          )}
        </div>

        {valueType ===
          "ordinal" && (
          <div className="space-y-3 rounded-xl border border-white/10 p-4">
            <div>
              <p className="font-bold">
                Niveles
              </p>

              <p className="text-xs text-slate-400">
                La clave es el
                valor técnico
                guardado. La
                etiqueta es lo
                que verá el
                usuario.
              </p>
            </div>

            {ordinalOptions.map(
              (
                option,
                index
              ) => (
                <div
                  key={index}
                  className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <input
                    className={
                      field
                    }
                    required
                    value={
                      option.key
                    }
                    placeholder="clave"
                    onChange={(
                      event
                    ) =>
                      updateOption(
                        index,
                        "key",
                        event.target
                          .value
                      )
                    }
                  />

                  <input
                    className={
                      field
                    }
                    required
                    value={
                      option.label
                    }
                    placeholder="Etiqueta"
                    onChange={(
                      event
                    ) =>
                      updateOption(
                        index,
                        "label",
                        event.target
                          .value
                      )
                    }
                  />

                  <button
                    type="button"
                    className="rounded-xl border border-red-400/30 px-3 py-2 text-sm text-red-300"
                    onClick={() =>
                      removeOption(
                        index
                      )
                    }
                  >
                    Quitar
                  </button>
                </div>
              )
            )}

            <button
              type="button"
              className="rounded-xl border border-white/10 px-3 py-2 text-sm"
              onClick={
                addOption
              }
            >
              + Agregar nivel
            </button>
          </div>
        )}

        {valueType ===
          "numeric" && (
          <label className="block">
            <input
              type="checkbox"
              name="allowsNegative"
              defaultChecked={
                kpi.allowsNegative
              }
            />{" "}
            Permitir negativos
          </label>
        )}

        <label className="block">
          <input
            type="checkbox"
            name="defaultRequired"
            defaultChecked={
              kpi.required
            }
          />{" "}
          Obligatorio por defecto
          al agregar a otras
          partidas
        </label>

        <p className="text-xs text-slate-400">
          Este valor por defecto
          no cambia la
          obligatoriedad de las
          asociaciones ya
          existentes.
        </p>

        <label className="block text-sm">
          <input
            type="checkbox"
            name="confirmed"
            required
          />{" "}
          Confirmo el alcance del
          cambio y que revisaré
          los valores existentes.
        </label>
      </Operation>
    </details>
  );
}

function description(
  kpi: CatalogKpi
) {
  if (
    kpi.valueType ===
    "ordinal"
  ) {
    return `${kpi.name} · por niveles`;
  }

  return `${kpi.name} · ${kpi.unit}`;
}

export function KpiManagement({
  gameId,
  data,
}: {
  gameId: string;
  data: PreparationData;
}) {
  const available =
    data.catalog.filter(
      (kpi) =>
        kpi.active &&
        !data.predecessor.some(previous => previous.id === kpi.id) &&
        !data.definitions.some(
          (definition) =>
            definition.id ===
            kpi.id
        )
    );

  const [
    chosen,
    setChosen,
  ] = useState(
    available[0]?.id ?? ""
  );

  const selected =
    available.find(
      (kpi) =>
        kpi.id === chosen
    );

  return (
    <div className="mt-6 space-y-4">
      <h3 className="text-lg font-bold">
        KPIs de esta partida
      </h3>

      {data.definitions.filter(definition => !data.predecessor.some(k => k.id === definition.id)).map(
        (definition) => {
          const kpi =
            data.catalog.find(
              (candidate) =>
                candidate.id ===
                definition.id
            )!;

          return (
            <div
              key={
                definition.id
              }
              className="rounded-xl border border-white/10 p-4"
            >
              <p className="font-bold">
                {
                  definition.name
                }{" "}

                <span className="text-sm text-slate-400">
                  {
                    definition.key
                  }
                </span>
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {definition.valueType ===
                "ordinal"
                  ? `Por niveles · ${definition.ordinalOptions
                      .map(
                        (
                          option
                        ) =>
                          option.label
                      )
                      .join(" · ")}`
                  : `${definition.unit} · ${definition.precision} decimales`}
              </p>

              <>
              <Operation
                gameId={gameId}
                data={data}
                kpiId={
                  definition.id
                }
                operation="set_required"
                label="Guardar obligatoriedad"
              >
                <label>
                  <input
                    type="checkbox"
                    name="required"
                    defaultChecked={
                      definition.required
                    }
                  />{" "}
                  Obligatorio en
                  esta partida
                </label>
              </Operation>

              {kpi.canManage ? (
                <Editor
                  kpi={kpi}
                  gameId={
                    gameId
                  }
                  data={data}
                />
              ) : (
                <p className="mt-3 text-sm text-slate-400">
                  Definición
                  protegida por
                  uso histórico o
                  por una partida
                  no editable.
                </p>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-red-300">
                  Quitar de esta
                  partida
                </summary>

                <Operation
                  gameId={
                    gameId
                  }
                  data={data}
                  kpiId={
                    definition.id
                  }
                  operation="remove_kpi"
                  label="Confirmar: quitar de esta partida"
                >
                  <p className="text-sm">
                    Se quitarán la
                    asociación y su
                    valor de
                    preparación, si
                    existe. El
                    catálogo y las
                    otras partidas
                    se conservan.
                  </p>

                  <label className="block">
                    <input
                      type="checkbox"
                      name="confirmed"
                      required
                    />{" "}
                    Confirmo quitar
                    este KPI y su
                    valor de esta
                    partida.
                  </label>
                </Operation>
              </details>
              </>
            </div>
          );
        }
      )}

      <details className="rounded-xl border border-white/10 p-4">
        <summary className="cursor-pointer font-bold">
          Agregar del catálogo
        </summary>

        {available.length ? (
          <>
            <select
              className={`${field} mt-3`}
              value={chosen}
              onChange={(
                event
              ) =>
                setChosen(
                  event.target
                    .value
                )
              }
            >
              {available.map(
                (kpi) => (
                  <option
                    key={
                      kpi.id
                    }
                    value={
                      kpi.id
                    }
                  >
                    {description(
                      kpi
                    )}
                  </option>
                )
              )}
            </select>

            {selected && (
              <Operation
                key={
                  selected.id
                }
                gameId={
                  gameId
                }
                data={data}
                kpiId={
                  selected.id
                }
                operation="add_kpi"
                label="Agregar a esta partida"
              >
                <label>
                  <input
                    type="checkbox"
                    name="required"
                    defaultChecked={
                      selected.required
                    }
                  />{" "}
                  Obligatorio en
                  esta partida
                </label>
              </Operation>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm">
            No hay otros KPIs
            activos disponibles.
          </p>
        )}
      </details>

      <details className="rounded-xl border border-white/10 p-4">
        <summary className="cursor-pointer">
          Administrar catálogo
          no seleccionado
        </summary>

        {data.catalog
          .filter(
            (kpi) =>
              !data.definitions.some(
                (
                  definition
                ) =>
                  definition.id ===
                  kpi.id
              )
          )
          .map((kpi) => (
            <div
              className="mt-4 border-t border-white/10 pt-3"
              key={kpi.id}
            >
              <p>
                {description(
                  kpi
                )}
              </p>

              {kpi.canManage && (
                <Editor
                  kpi={kpi}
                  gameId={
                    gameId
                  }
                  data={data}
                />
              )}

              {kpi.canManage &&
                kpi.associationCount ===
                  0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-red-300">
                      Eliminar del
                      catálogo
                    </summary>

                    <Operation
                      gameId={
                        gameId
                      }
                      data={
                        data
                      }
                      kpiId={
                        kpi.id
                      }
                      operation="delete_kpi"
                      label="Eliminar del catálogo"
                    >
                      <label>
                        <input
                          type="checkbox"
                          name="confirmed"
                          required
                        />{" "}
                        Confirmo
                        eliminar esta
                        definición sin
                        asociaciones ni
                        uso histórico.
                      </label>
                    </Operation>
                  </details>
                )}
            </div>
          ))}
      </details>
    </div>
  );
}
