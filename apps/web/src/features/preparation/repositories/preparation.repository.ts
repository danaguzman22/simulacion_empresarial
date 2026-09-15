import "server-only";
import { inheritedKpiIds, predecessorKpis } from "./inherited-kpis";

import { createHash } from "node:crypto";
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
} from "drizzle-orm";

import { db } from "@/db";
import {
  campaigns,
  campaignMembers,
  games,
  gameKpis,
  gamePreparationChanges,
  gameStateSets,
  gameStateValues,
  kpiDefinitions,
  kpiOrdinalOptions,
} from "@/db/schema";

import {
  canReadPreparation,
  canWritePreparation,
  isPreparationEditable,
  normalizeValue,
  PreparationError,
} from "../domain/preparation";

export type Transaction =
  Parameters<
    Parameters<typeof db.transaction>[0]
  >[0];

export const hash = (
  value: unknown
) =>
  createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

function storedValue(row: {
  value: string | null;
  ordinalKey: string | null;
}): string | null {
  return row.value ?? row.ordinalKey;
}

function displayValue(
  definition: {
    valueType: "numeric" | "ordinal";
    ordinalOptions: Array<{
      key: string;
      label: string;
      position: number;
    }>;
  },
  value: string | null
): string | null {
  if (value === null) {
    return null;
  }

  if (
    definition.valueType ===
    "ordinal"
  ) {
    return (
      definition.ordinalOptions.find(
        (option) =>
          option.key === value
      )?.label ?? value
    );
  }

  return value;
}

export async function definitionsFor(
  tx: Transaction,
  campaignId: string
) {
  return tx
    .select()
    .from(kpiDefinitions)
    .where(
      eq(
        kpiDefinitions.campaignId,
        campaignId
      )
    )
    .orderBy(
      asc(kpiDefinitions.key)
    );
}

export async function selectionContext(
  tx: Transaction,
  campaignId: string,
  gameId: string
) {
  const baseCatalog =
    await definitionsFor(
      tx,
      campaignId
    );

  const ordinalRows =
    await tx
      .select({
        kpiDefinitionId:
          kpiOrdinalOptions.kpiDefinitionId,
        key: kpiOrdinalOptions.key,
        label:
          kpiOrdinalOptions.label,
        position:
          kpiOrdinalOptions.position,
      })
      .from(kpiOrdinalOptions)
      .innerJoin(
        kpiDefinitions,
        eq(
          kpiDefinitions.id,
          kpiOrdinalOptions.kpiDefinitionId
        )
      )
      .where(
        eq(
          kpiDefinitions.campaignId,
          campaignId
        )
      )
      .orderBy(
        asc(
          kpiOrdinalOptions.kpiDefinitionId
        ),
        asc(
          kpiOrdinalOptions.position
        )
      );

  const catalog =
    baseCatalog.map(
      (definition) => ({
        ...definition,

        ordinalOptions:
          ordinalRows
            .filter(
              (option) =>
                option.kpiDefinitionId ===
                definition.id
            )
            .map(
              ({
                key,
                label,
                position,
              }) => ({
                key,
                label,
                position,
              })
            ),
      })
    );

  const associations =
    await tx
      .select()
      .from(gameKpis)
      .where(
        eq(
          gameKpis.campaignId,
          campaignId
        )
      )
      .orderBy(
        asc(gameKpis.gameId),
        asc(
          gameKpis.kpiDefinitionId
        )
      );

  const states =
    await tx
      .select({
        gameId:
          gameStateSets.gameId,
        revision:
          gameStateSets.revision,
        frozenAt:
          gameStateSets.frozenAt,
        phase:
          gameStateSets.phase,
      })
      .from(gameStateSets)
      .where(
        eq(
          gameStateSets.campaignId,
          campaignId
        )
      )
      .orderBy(
        asc(gameStateSets.gameId),
        asc(gameStateSets.phase)
      );

  const campaignGames =
    await tx
      .select({
        id: games.id,
        status: games.status,
      })
      .from(games)
      .where(
        eq(
          games.campaignId,
          campaignId
        )
      )
      .orderBy(asc(games.id));

  const selected =
    associations.filter(
      (association) =>
        association.gameId ===
        gameId
    );

  const definitions =
    catalog
      .filter((definition) =>
        selected.some(
          (association) =>
            association.kpiDefinitionId ===
            definition.id
        )
      )
      .map((definition) => ({
        ...definition,
        origin: selected.find(k => k.kpiDefinitionId === definition.id)!.origin,

        required:
          selected.find(
            (association) =>
              association.kpiDefinitionId ===
              definition.id
          )!.required,
      }));

  return {
    catalog,
    associations,
    definitions,

    catalogToken: hash({
      catalog,
      associations,
      states,
      campaignGames,
    }),

    states,
    campaignGames,
  };
}

export async function access(
  tx: Transaction,
  gameId: string,
  actorId: string,
  write: boolean
) {
  const [located] =
    await tx
      .select({
        campaignId:
          games.campaignId,
      })
      .from(games)
      .where(eq(games.id, gameId));

  if (!located) {
    throw new PreparationError(
      "No tenés acceso a esta partida."
    );
  }

  if (write) {
    await tx
      .select({
        id: campaigns.id,
      })
      .from(campaigns)
      .where(
        eq(
          campaigns.id,
          located.campaignId
        )
      )
      .for("update");

    await tx
      .select({
        id: games.id,
      })
      .from(games)
      .where(eq(games.id, gameId))
      .for("update");
  }

  const query =
    tx
      .select({
        game: games,
        role:
          campaignMembers.role,
      })
      .from(games)
      .innerJoin(
        campaignMembers,
        and(
          eq(
            campaignMembers.campaignId,
            games.campaignId
          ),
          eq(
            campaignMembers.profileId,
            actorId
          )
        )
      )
      .where(
        eq(games.id, gameId)
      );

  const [found] = write
    ? await query.for(
        "share",
        {
          of: campaignMembers,
        }
      )
    : await query;

  if (
    !found ||
    !canReadPreparation(
      found.role
    ) ||
    (write &&
      !canWritePreparation(
        found.role
      ))
  ) {
    throw new PreparationError(
      "No tenés permiso para realizar esta operación."
    );
  }

  return found;
}

export async function readPreparation(
  gameId: string,
  actorId: string
) {
  return db.transaction(
    async (tx) => {
      const { game, role } =
        await access(
          tx,
          gameId,
          actorId,
          false
        );

      const context =
        await selectionContext(
          tx,
          game.campaignId,
          gameId
        );

      const { definitions } =
        context;

      const [state] =
        await tx
          .select()
          .from(gameStateSets)
          .where(
            and(
              eq(
                gameStateSets.gameId,
                gameId
              ),
              eq(
                gameStateSets.phase,
                "preparation"
              )
            )
          );

      const valueRows = state
        ? await tx
            .select({
              kpiId:
                gameStateValues.kpiDefinitionId,

              value:
                gameStateValues.value,

              ordinalKey:
                gameStateValues.ordinalKey,
            })
            .from(
              gameStateValues
            )
            .where(
              eq(
                gameStateValues.stateSetId,
                state.id
              )
            )
        : [];

      const values =
        valueRows.flatMap(
          (row) => {
            const value =
              storedValue(row);

            if (value === null) {
              return [];
            }

            return [
              {
                kpiId: row.kpiId,
                value,
              },
            ];
          }
        );

      const [source] =
        state?.sourceStateSetId
          ? await tx
              .select({
                id:
                  gameStateSets.id,
                name:
                  games.name,
                sequence:
                  games.sequence,
              })
              .from(
                gameStateSets
              )
              .innerJoin(
                games,
                eq(
                  games.id,
                  gameStateSets.gameId
                )
              )
              .where(
                eq(
                  gameStateSets.id,
                  state.sourceStateSetId
                )
              )
          : [];

      const inheritedIds = await inheritedKpiIds(tx, game.id);
      const predecessor = await predecessorKpis(tx, game.id);
      const sources: {
        id: string;
        name: string;
        sequence: number;
      }[] = [];

      return {
        predecessor: predecessor.map(previous => {
          const definition = context.catalog.find(k => k.id === previous.id)!;
          const selected = definitions.find(k => k.id === previous.id);
          return { ...previous, name: definition.name, unit: definition.unit, precision: definition.precision, valueType: definition.valueType, allowsNegative: definition.allowsNegative, ordinalOptions: definition.ordinalOptions, included: !!selected, origin: selected?.origin ?? "inherited" as const };
        }),
        revision:
          state?.revision ?? 0,

        catalogToken:
          context.catalogToken,

        catalog:
          context.catalog.map(
            (definition) => ({
              ...definition,

              historicalUsedAt:
                definition.historicalUsedAt?.toISOString() ??
                null,

              usedAt:
                definition.usedAt?.toISOString() ??
                null,

              createdAt:
                definition.createdAt.toISOString(),

              updatedAt:
                definition.updatedAt.toISOString(),

              associationCount:
                context.associations.filter(
                  (association) =>
                    association.kpiDefinitionId ===
                    definition.id
                ).length,

              canManage:
                !definition.historicalUsedAt &&
                context.associations
                  .filter(
                    (association) =>
                      association.kpiDefinitionId ===
                      definition.id
                  )
                  .every(
                    (association) =>
                      !association.historicalUsedAt &&
                      context.campaignGames.some(
                        (campaignGame) =>
                          campaignGame.id ===
                            association.gameId &&
                          (campaignGame.status ===
                            "draft" ||
                            campaignGame.status ===
                              "ready")
                      ) &&
                      !context.states.some(
                        (candidateState) =>
                          candidateState.gameId ===
                            association.gameId &&
                          (candidateState.phase !==
                            "preparation" ||
                            candidateState.frozenAt)
                      )
                  ),
            })
          ),

        definitions:
          definitions.map(
            ({
              id,
              key,
              name,
              unit,
              precision,
              required,
              allowsNegative,
              valueType,
              ordinalOptions,
              origin,
            }) => ({
              inherited: inheritedIds.has(id),
              origin,
              id,
              key,
              name,
              unit,
              precision,
              required,
              allowsNegative,
              valueType,
              ordinalOptions,
            })
          ),

        values,

        source:
          source ?? null,

        sources,

        canEdit:
          canWritePreparation(
            role
          ) &&
          isPreparationEditable(
            game.status,
            state?.frozenAt ??
              null
          ),
      };
    },
    {
      isolationLevel:
        "repeatable read",
      accessMode: "read only",
    }
  );
}

export type SavePreparationInput = {
  gameId: string;
  operationId: string;
  expectedRevision: number;
  catalogToken: string;

  operation:
    | "save_values"
    | "copy_snapshot";

  values:
    Record<string, string>;

  sourceId:
    string | null;
};

export async function writePreparation(
  actorId: string,
  input: SavePreparationInput
) {
  const requestHash =
    hash({
      actorId,
      ...input,

      values:
        Object.fromEntries(
          Object.entries(
            input.values
          ).sort(
            ([a], [b]) =>
              a.localeCompare(b)
          )
        ),
    });

  return db.transaction(
    async (tx) => {
      const { game } =
        await access(
          tx,
          input.gameId,
          actorId,
          true
        );

      const [state] =
        await tx
          .select()
          .from(gameStateSets)
          .where(
            and(
              eq(
                gameStateSets.gameId,
                game.id
              ),
              eq(
                gameStateSets.phase,
                "preparation"
              )
            )
          )
          .for("update");

      const [
        previousOperation,
      ] =
        await tx
          .select()
          .from(
            gamePreparationChanges
          )
          .where(
            eq(
              gamePreparationChanges.operationId,
              input.operationId
            )
          );

      if (
        previousOperation
      ) {
        if (
          previousOperation.requestHash !==
            requestHash ||
          previousOperation.actorId !==
            actorId ||
          previousOperation.stateSetId !==
            state?.id
        ) {
          throw new PreparationError(
            "El identificador de operación ya fue utilizado con otros datos. Recargá la página."
          );
        }

        return {
          revision:
            previousOperation.revision,
          replayed: true,
        };
      }

      if (
        !isPreparationEditable(
          game.status,
          state?.frozenAt ??
            null
        )
      ) {
        throw new PreparationError(
          "La preparación de esta partida no es editable."
        );
      }

      if (
        (state?.revision ?? 0) !==
        input.expectedRevision
      ) {
        throw new PreparationError(
          "Otro Master modificó la preparación. Recargá los datos antes de guardar."
        );
      }

      const context =
        await selectionContext(
          tx,
          game.campaignId,
          game.id
        );

      const { definitions } =
        context;

      if (
        context.catalogToken !==
        input.catalogToken
      ) {
        throw new PreparationError(
          "Cambió el catálogo de KPIs. Recargá los datos antes de guardar."
        );
      }

      const active =
        definitions;

      if (!active.length) {
        throw new PreparationError(
          "Agregá al menos un KPI antes de guardar la preparación."
        );
      }

      const beforeRows =
        state
          ? await tx
              .select()
              .from(
                gameStateValues
              )
              .where(
                eq(
                  gameStateValues.stateSetId,
                  state.id
                )
              )
          : [];

      const beforeMap =
        new Map<
          string,
          string
        >();

      for (
        const row of beforeRows
      ) {
        const value =
          storedValue(row);

        if (value !== null) {
          beforeMap.set(
            row.kpiDefinitionId,
            value
          );
        }
      }

      const inheritedIds = await inheritedKpiIds(tx, game.id);
      const nextMap =
        new Map(beforeMap);

      const sourceId =
        state?.sourceStateSetId ??
        null;

      if (
        input.operation !==
          "save_values" ||
        input.sourceId !== null
      ) {
        throw new PreparationError(
          "La copia de cierres no está disponible en este bloque."
        );
      }

      const sentIds =
        Object.keys(
          input.values
        );

      if (
        sentIds.length !==
          active.length ||
        sentIds.some(
          (id) =>
            !active.some(
              (definition) =>
                definition.id ===
                id
            )
        )
      ) {
        throw new PreparationError(
          "Los KPIs enviados no coinciden con la selección. Recargá los datos."
        );
      }

      for (
        const definition of
        active
      ) {
        const value =
          normalizeValue(
            input.values[
              definition.id
            ],
            definition
          );

        if (inheritedIds.has(definition.id) && value !== (beforeMap.get(definition.id) ?? null)) throw new PreparationError("El valor heredado no puede modificarse; proviene del final de la partida anterior.");
        if (value === null) {
          nextMap.delete(
            definition.id
          );
        } else {
          nextMap.set(
            definition.id,
            value
          );
        }
      }

      /*
       * Validar también los
       * valores que ya existían.
       */
      for (
        const [id, value] of
        nextMap
      ) {
        const definition =
          definitions.find(
            (candidate) =>
              candidate.id === id
          );

        if (!definition) {
          throw new PreparationError(
            "El origen contiene un KPI que no pertenece a esta campaña."
          );
        }

        nextMap.set(
          id,
          normalizeValue(
            value,
            definition
          )!
        );
      }

      let stateId =
        state?.id;

      if (!stateId) {
        const [created] =
          await tx
            .insert(
              gameStateSets
            )
            .values({
              gameId:
                game.id,

              campaignId:
                game.campaignId,

              phase:
                "preparation",

              createdBy:
                actorId,

              updatedBy:
                actorId,
            })
            .returning({
              id:
                gameStateSets.id,
            });

        stateId =
          created.id;
      }

      /*
       * Una vez guardada la
       * preparación, la semántica
       * del KPI ya fue utilizada.
       */
      await tx
        .update(kpiDefinitions)
        .set({
          usedAt:
            new Date(),

          updatedAt:
            new Date(),
        })
        .where(
          and(
            inArray(
              kpiDefinitions.id,
              active.map(
                (definition) =>
                  definition.id
              )
            ),

            isNull(
              kpiDefinitions.usedAt
            )
          )
        );

      const changes = [
        ...new Set([
          ...beforeMap.keys(),
          ...nextMap.keys(),
        ]),
      ]
        .sort()
        .flatMap((id) => {
          const oldValue =
            beforeMap.get(id) ??
            null;

          const newValue =
            nextMap.get(id) ??
            null;

          if (
            oldValue ===
            newValue
          ) {
            return [];
          }

          const definition =
            definitions.find(
              (candidate) =>
                candidate.id ===
                id
            )!;

          return [
            {
              kpiId: id,

              key:
                definition.key,

              unit:
                definition.unit,

              valueType:
                definition.valueType,

              before:
                oldValue,

              after:
                newValue,

              beforeDisplay:
                displayValue(
                  definition,
                  oldValue
                ),

              afterDisplay:
                displayValue(
                  definition,
                  newValue
                ),
            },
          ];
        });

      for (
        const change of
        changes
      ) {
        if (
          change.after ===
          null
        ) {
          await tx
            .delete(
              gameStateValues
            )
            .where(
              and(
                eq(
                  gameStateValues.stateSetId,
                  stateId
                ),
                eq(
                  gameStateValues.kpiDefinitionId,
                  change.kpiId
                )
              )
            );

          continue;
        }

        const definition =
          definitions.find(
            (candidate) =>
              candidate.id ===
              change.kpiId
          )!;

        const numericValue =
          definition.valueType ===
          "numeric"
            ? change.after
            : null;

        const ordinalKey =
          definition.valueType ===
          "ordinal"
            ? change.after
            : null;

        await tx
          .insert(
            gameStateValues
          )
          .values({
            gameId:
              game.id,

            stateSetId:
              stateId,

            campaignId:
              game.campaignId,

            kpiDefinitionId:
              change.kpiId,

            value:
              numericValue,

            ordinalKey,
          })
          .onConflictDoUpdate({
            target: [
              gameStateValues.stateSetId,
              gameStateValues.kpiDefinitionId,
            ],

            set: {
              value:
                numericValue,

              ordinalKey,

              updatedAt:
                new Date(),
            },
          });
      }

      const revision =
        input.expectedRevision +
        1;

      await tx
        .update(gameStateSets)
        .set({
          revision,

          sourceStateSetId:
            sourceId,

          updatedBy:
            actorId,

          updatedAt:
            new Date(),
        })
        .where(
          eq(
            gameStateSets.id,
            stateId
          )
        );

      await tx
        .insert(
          gamePreparationChanges
        )
        .values({
          operationId:
            input.operationId,

          campaignId:
            game.campaignId,

          stateSetId:
            stateId,

          actorId,

          operation:
            input.operation,

          requestHash,

          previousRevision:
            input.expectedRevision,

          revision,

          details: {
            changes,

            sourceBefore:
              state?.sourceStateSetId ??
              null,

            sourceAfter:
              sourceId,
          },
        });

      return {
        revision,
        replayed: false,
      };
    },
    {
      isolationLevel:
        "read committed",
    }
  );
}
