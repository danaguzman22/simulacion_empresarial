import {
  KpiManagement,
} from "./KpiManagement";
import { SourceKpiConfiguration } from "./SourceKpiConfiguration";

import {
  KpiDefinitionForm,
} from "./KpiDefinitionForm";

import {
  PreparationForm,
  type PreparationData,
} from "./PreparationForm";

export function InitialConfiguration({
  gameId,
  data,
}: {
  gameId: string;
  data: PreparationData;
}) {
  const missing =
    data.definitions.filter(
      (definition) =>
        definition.required &&
        !data.values.some(
          (value) =>
            value.kpiId ===
            definition.id
        )
    );

  function displayValue(
    definition:
      PreparationData["definitions"][number],
    value:
      string | undefined
  ) {
    if (!value) {
      return "Sin configurar";
    }

    if (
      definition.valueType ===
      "ordinal"
    ) {
      return (
        definition.ordinalOptions.find(
          (option) =>
            option.key === value
        )?.label ??
        value
      );
    }

    return value;
  }

  return (
    <section
      aria-labelledby="initial-configuration"
      className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8"
    >
      <h2
        id="initial-configuration"
        className="text-2xl font-black"
      >
        Configuración inicial
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Preparación · Revisión{" "}
        {data.revision}
      </p>

      <p className="mt-3 text-sm">
        {data.source
          ? `Base: cierre de ${data.source.name}. Elegí qué KPIs incluir y si querés heredar o definir sus valores iniciales.`
          : "Sin snapshot de origen. Los valores se configuran en esta preparación."}
      </p>

      <SourceKpiConfiguration gameId={gameId} data={data} />
      {missing.length > 0 && (
        <p className="mt-3 text-sm text-amber-300">
          Preparación incompleta:{" "}
          {missing.length} KPI(s)
          obligatorio(s) pendiente(s).
        </p>
      )}

      {data.definitions.length ===
      0 ? (
        <p className="mt-5 text-sm text-slate-400">
          {data.canEdit
            ? "Esta partida aún no tiene KPIs seleccionados. Agregá indicadores desde el catálogo o creá una nueva definición."
            : "Esta partida aún no tiene KPIs seleccionados. Un Master o Co-Master debe configurarlos."}
        </p>
      ) : data.canEdit ? (
        <PreparationForm
          key={`${data.revision}:${data.catalogToken}`}
          gameId={gameId}
          data={data}
        />
      ) : (
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          {data.definitions.map(
            (definition) => {
              const storedValue =
                data.values.find(
                  (value) =>
                    value.kpiId ===
                    definition.id
                )?.value;

              const configured =
                storedValue !==
                undefined;

              const shownValue =
                displayValue(
                  definition,
                  storedValue
                );

              return (
                <div
                  key={
                    definition.id
                  }
                  className="rounded-xl border border-white/10 p-4"
                >
                  <dt className="font-bold">
                    {
                      definition.name
                    }
                  </dt>
                  <p className="text-sm text-sky-300">{definition.origin === "inherited" ? "Heredado" : definition.origin === "redefined" ? "Redefinido" : "Nuevo"}</p>

                  <dd className="mt-2 text-slate-300">
                    {shownValue}

                    {configured &&
                      definition.unit && (
                        <>
                          {" "}
                          ·{" "}
                          {
                            definition.unit
                          }
                        </>
                      )}
                  </dd>

                  {definition.required &&
                    !configured && (
                      <p className="mt-2 text-xs text-amber-300">
                        Obligatorio
                        pendiente
                      </p>
                    )}

                  <p className="mt-2 text-xs text-slate-500">
                    {definition.valueType ===
                    "ordinal"
                      ? "KPI por niveles"
                      : `KPI numérico · ${definition.precision} decimales`}
                  </p>
                </div>
              );
            }
          )}
        </dl>
      )}

      {!data.canEdit && (
        <p className="mt-4 text-sm text-slate-400">
          Solo lectura.
        </p>
      )}

      {data.canEdit && (
        <KpiManagement
          key={`management:${data.revision}:${data.catalogToken}`}
          gameId={gameId}
          data={data}
        />
      )}

      {data.canEdit && (
        <KpiDefinitionForm
          key={`create:${data.revision}:${data.catalogToken}`}
          gameId={gameId}
          revision={
            data.revision
          }
          catalogToken={
            data.catalogToken
          }
        />
      )}
    </section>
  );
}
