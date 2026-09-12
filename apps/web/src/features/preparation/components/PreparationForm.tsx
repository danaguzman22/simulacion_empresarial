"use client";

import {
  useActionState,
  useRef,
  useState,
} from "react";

import {
  savePreparationAction,
  type PreparationActionState,
} from "../application/preparation-actions";

import type {
  readPreparation,
} from "../repositories/preparation.repository";

export type PreparationData =
  Awaited<
    ReturnType<
      typeof readPreparation
    >
  >;

const initial:
  PreparationActionState = {};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white focus:outline-2 focus:outline-sky-400";

export function PreparationForm({
  gameId,
  data,
}: {
  gameId: string;
  data: PreparationData;
}) {
  const [
    state,
    action,
    pending,
  ] = useActionState(
    savePreparationAction,
    initial
  );

  const operationId =
    useRef<string | null>(
      null
    );

  const [copy, setCopy] =
    useState(false);

  const [
    values,
    setValues,
  ] = useState<
    Record<string, string>
  >(
    Object.fromEntries(
      data.definitions.map(
        (definition) => [
          definition.id,

          data.values.find(
            (value) =>
              value.kpiId ===
              definition.id
          )?.value ?? "",
        ]
      )
    )
  );

  const missing =
    data.definitions.filter(
      (definition) =>
        definition.required &&
        !values[
          definition.id
        ]?.trim()
    );

  function updateValue(
    id: string,
    value: string
  ) {
    setValues(
      (current) => ({
        ...current,
        [id]: value,
      })
    );
  }

  return (
    <form
      action={action}
      onSubmit={(
        event
      ) => {
        /*
         * Conservamos el mismo ID
         * si el navegador reintenta
         * exactamente la misma
         * operación.
         */
        operationId.current ??=
          crypto.randomUUID();

        const input =
          event.currentTarget.elements.namedItem(
            "operationId"
          ) as HTMLInputElement;

        input.value =
          operationId.current;
      }}
      onChange={() => {
        operationId.current =
          null;
      }}
      className="mt-5 space-y-5"
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
        value={data.revision}
      />

      <input
        type="hidden"
        name="catalogToken"
        value={
          data.catalogToken
        }
      />

      <input
        type="hidden"
        name="operation"
        value={
          copy
            ? "copy_snapshot"
            : "save_values"
        }
      />

      <fieldset
        disabled={pending}
        className="space-y-5"
      >
        {data.sources.length >
          0 && (
          <div className="space-y-3 rounded-xl border border-white/10 p-4">
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={copy}
                onChange={(
                  event
                ) =>
                  setCopy(
                    event.target
                      .checked
                  )
                }
              />

              Copiar un cierre
              anterior
            </label>

            {copy && (
              <>
                <select
                  name="sourceId"
                  required
                  className={
                    inputClass
                  }
                  defaultValue=""
                >
                  <option
                    value=""
                    disabled
                  >
                    Seleccioná un
                    snapshot final
                  </option>

                  {data.sources.map(
                    (
                      source
                    ) => (
                      <option
                        key={
                          source.id
                        }
                        value={
                          source.id
                        }
                      >
                        Partida{" "}
                        {
                          source.sequence
                        }
                        :{" "}
                        {
                          source.name
                        }
                      </option>
                    )
                  )}
                </select>

                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="confirmCopy"
                    required
                  />

                  Confirmo reemplazar
                  los valores
                  preparados por una
                  copia del cierre
                  seleccionado.
                </label>
              </>
            )}
          </div>
        )}

        {!copy &&
          data.definitions.map(
            (definition) => {
              const value =
                values[
                  definition.id
                ] ?? "";

              const configured =
                Boolean(
                  value.trim()
                );

              return (
                <div
                  key={
                    definition.id
                  }
                  className="rounded-xl border border-white/10 p-4"
                >
                  <div>
                    <span className="font-bold">
                      {
                        definition.name
                      }
                    </span>

                    <span className="ml-2 text-sm text-slate-400">
                      {definition.valueType ===
                      "numeric"
                        ? `${definition.unit} · ${definition.precision} decimales`
                        : `${definition.unit} · por niveles`}
                    </span>
                  </div>

                  {definition.valueType ===
                  "ordinal" ? (
                    <select
                      name={`value:${definition.id}`}
                      value={
                        value
                      }
                      onChange={(
                        event
                      ) =>
                        updateValue(
                          definition.id,
                          event.target
                            .value
                        )
                      }
                      className={`${inputClass} mt-2`}
                    >
                      <option value="">
                        Sin configurar
                      </option>

                      {definition.ordinalOptions.map(
                        (
                          option
                        ) => (
                          <option
                            key={
                              option.key
                            }
                            value={
                              option.key
                            }
                          >
                            {
                              option.label
                            }
                          </option>
                        )
                      )}
                    </select>
                  ) : (
                    <input
                      name={`value:${definition.id}`}
                      inputMode="decimal"
                      value={
                        value
                      }
                      onChange={(
                        event
                      ) =>
                        updateValue(
                          definition.id,
                          event.target
                            .value
                        )
                      }
                      placeholder="Sin configurar"
                      className={`${inputClass} mt-2`}
                      maxLength={64}
                    />
                  )}

                  {definition.required && (
                    <span
                      className={`mt-2 block text-xs ${
                        configured
                          ? "text-slate-400"
                          : "text-amber-300"
                      }`}
                    >
                      {configured
                        ? "Obligatorio"
                        : "Obligatorio pendiente"}
                    </span>
                  )}

                  {definition.valueType ===
                  "numeric" ? (
                    <span className="mt-1 block text-xs text-slate-400">
                      {definition.allowsNegative
                        ? "Admite valores negativos."
                        : "No admite valores negativos."}
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs text-slate-400">
                      Seleccioná uno
                      de los niveles
                      definidos para
                      este KPI.
                    </span>
                  )}
                </div>
              );
            }
          )}

        {!copy && (
          <p className="text-sm text-slate-400">
            {missing.length
              ? `Preparación incompleta: ${missing.length} KPI(s) obligatorio(s) pendiente(s).`
              : "Sin KPIs obligatorios pendientes."}

            {" "}

            Podés guardar una
            preparación incompleta.
            Un campo vacío no
            equivale a cero.

            {data.definitions.some(
              (definition) =>
                definition.valueType ===
                "numeric"
            ) &&
              " Para valores numéricos podés usar coma o punto decimal, sin separadores de miles."}
          </p>
        )}

        <button
          className="rounded-xl bg-white px-4 py-3 font-bold text-slate-950 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-400"
          disabled={pending}
        >
          {pending
            ? "Guardando..."
            : copy
              ? "Copiar snapshot"
              : "Guardar preparación"}
        </button>
      </fieldset>

      {state.error && (
        <div
          role="alert"
          className="space-y-2 text-sm text-red-300"
        >
          <p>
            {state.error}
          </p>

          <button
            type="button"
            onClick={() =>
              window.location.reload()
            }
            className="underline"
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