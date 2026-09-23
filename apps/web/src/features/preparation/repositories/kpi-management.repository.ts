import { assertNoRuleDependency } from "@/features/rules/repositories/rule.repository";
﻿import "server-only";
import { predecessorKpis } from "./inherited-kpis";

import {
  randomUUID,
} from "node:crypto";

import {
  and,
  asc,
  eq,
  inArray,
} from "drizzle-orm";

import { db } from "@/db";

import {
  games,
  gameKpis,
  gameGoals,
  kpiDefinitions,
  kpiOrdinalOptions,
  gameStateSets,
  gameStateValues,
  gamePreparationChanges,
} from "@/db/schema";

import {
  access,
  selectionContext,
  hash,
  type Transaction,
} from "./preparation.repository";

import {
  isPreparationEditable,
  normalizeValue,
  PreparationError,
  validateDefinition,
  type DefinitionInput,
  type ValidatedDefinition,
} from "../domain/preparation";

export type KpiMutation = {
  gameId: string;
  operationId: string;
  expectedRevision: number;
  catalogToken: string;

  operation:
    | "create_kpi"
    | "add_kpi"
    | "remove_kpi"
    | "set_required"
    | "edit_kpi"
    | "delete_kpi";

  kpiId?: string;
  required?: boolean;
  definition?: DefinitionInput;
  confirmed?: boolean;
};

async function preparation(
  tx: Transaction,
  gameId: string,
  campaignId: string,
  actorId: string
) {
  const [existing] =
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
      )
      .for("update");

  if (existing) {
    return existing;
  }

  const [created] =
    await tx
      .insert(gameStateSets)
      .values({
        gameId,
        campaignId,
        phase: "preparation",
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning();

  return created;
}

function databaseDefinition(
  definition: ValidatedDefinition
) {
  return {
    key: definition.key,
    name: definition.name,
    unit: definition.unit,
    precision:
      definition.precision,
    required:
      definition.required,
    allowsNegative:
      definition.allowsNegative,
    valueType:
      definition.valueType,
  };
}

function serializedValue(
  row: {
    value: string | null;
    ordinalKey:
      string | null;
  }
): string | null {
  return (
    row.value ??
    row.ordinalKey
  );
}

export async function mutateKpi(
  actorId: string,
  input: KpiMutation
) {
  const requestHash =
    hash({
      actorId,
      ...input,
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

      /*
       * El lock de campaña realizado en access()
       * serializa escrituras. Después bloqueamos
       * las partidas antes de estados/KPIs.
       */
      await tx
        .select({
          id: games.id,
        })
        .from(games)
        .where(
          eq(
            games.campaignId,
            game.campaignId
          )
        )
        .orderBy(
          asc(games.id)
        )
        .for("update");

      const [replay] =
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

      if (replay) {
        const [owner] =
          await tx
            .select()
            .from(gameStateSets)
            .where(
              eq(
                gameStateSets.id,
                replay.stateSetId
              )
            );

        if (
          replay.actorId !==
            actorId ||
          replay.requestHash !==
            requestHash ||
          owner?.gameId !==
            game.id
        ) {
          throw new PreparationError(
            "La operación ya se usó con otros datos."
          );
        }

        return {
          replayed: true,
          revision:
            replay.revision,
        };
      }

      const context =
        await selectionContext(
          tx,
          game.campaignId,
          game.id
        );

      const current =
        context.states.find(
          (state) =>
            state.gameId ===
              game.id &&
            state.phase ===
              "preparation"
        );

      if (
        !isPreparationEditable(
          game.status,
          current?.frozenAt ??
            null
        )
      ) {
        throw new PreparationError(
          "Esta partida ya no permite configurar KPIs."
        );
      }

      if (
        (current?.revision ??
          0) !==
          input.expectedRevision ||
        context.catalogToken !==
          input.catalogToken
      ) {
        throw new PreparationError(
          "Cambió la preparación o el catálogo. Recargá los datos antes de continuar."
        );
      }

      const predecessor = await predecessorKpis(tx, game.id);
      if (input.kpiId && ["remove_kpi", "delete_kpi"].includes(input.operation)) {
        await assertNoRuleDependency(tx,input.operation==="delete_kpi"?null:game.id,input.kpiId);
        const linked = await tx.select({ id: gameGoals.id }).from(gameGoals).where(
          input.operation === "remove_kpi"
            ? and(eq(gameGoals.kpiDefinitionId, input.kpiId), eq(gameGoals.gameId, game.id))
            : eq(gameGoals.kpiDefinitionId, input.kpiId)
        ).limit(1);
        if (linked.length) throw new PreparationError("Hay metas vinculadas a este KPI. Cambiá o eliminá esas metas antes de quitar el indicador.");
      }
      let definition =
        context.catalog.find(
          (candidate) =>
            candidate.id ===
            input.kpiId
        );

      if (
        input.operation !==
          "create_kpi" &&
        !definition
      ) {
        throw new PreparationError(
          "El KPI no existe en esta campaña."
        );
      }

      const affected =
        new Set<string>([
          game.id,
        ]);

      let before: unknown =
        definition ?? null;

      let after: unknown =
        null;

      const removedValues:
        Record<
          string,
          string | null
        > = {};

      /*
       * CREAR / EDITAR
       */
      if (
        input.operation ===
          "create_kpi" ||
        input.operation ===
          "edit_kpi"
      ) {
        if (
          !input.definition
        ) {
          throw new PreparationError(
            "Falta la definición."
          );
        }

        const next =
          validateDefinition(
            input.definition
          );

        if (
          context.catalog.some(
            (candidate) =>
              candidate.key ===
                next.key &&
              candidate.id !==
                definition?.id
          )
        ) {
          throw new PreparationError(
            "Ya existe un KPI con esa clave en la campaña."
          );
        }

        /*
         * CREAR KPI
         */
        if (
          input.operation ===
          "create_kpi"
        ) {
          const [created] =
            await tx
              .insert(
                kpiDefinitions
              )
              .values({
                ...databaseDefinition(
                  next
                ),

                campaignId:
                  game.campaignId,

                createdBy:
                  actorId,
              })
              .returning();

          if (
            next.valueType ===
            "ordinal"
          ) {
            await tx
              .insert(
                kpiOrdinalOptions
              )
              .values(
                next.ordinalOptions.map(
                  (option) => ({
                    kpiDefinitionId:
                      created.id,

                    key:
                      option.key,

                    label:
                      option.label,

                    position:
                      option.position,
                  })
                )
              );
          }

          definition = {
            ...created,

            ordinalOptions:
              next.ordinalOptions,
          };

          await preparation(
            tx,
            game.id,
            game.campaignId,
            actorId
          );

          await tx
            .insert(gameKpis)
            .values({
              gameId:
                game.id,

              campaignId:
                game.campaignId,

              kpiDefinitionId:
                created.id,

              required:
                next.required,

              createdBy:
                actorId,
            });

          before = null;
          after = definition;
        }

        /*
         * EDITAR KPI
         */
        else {
          const currentDefinition =
            definition!;

          const uses =
            context.associations.filter(
              (association) =>
                association.kpiDefinitionId ===
                currentDefinition.id
            );

          if (
            currentDefinition.historicalUsedAt ||
            uses.some(
              (association) =>
                association.historicalUsedAt ||
                !context.campaignGames.some(
                  (candidateGame) =>
                    candidateGame.id ===
                      association.gameId &&
                    (candidateGame.status ===
                      "draft" ||
                      candidateGame.status ===
                        "ready")
                ) ||
                context.states.some(
                  (state) =>
                    state.gameId ===
                      association.gameId &&
                    (state.phase !==
                      "preparation" ||
                      state.frozenAt)
                )
            )
          ) {
            throw new PreparationError(
              "El KPI tiene uso histórico o una partida no editable. Creá otra definición."
            );
          }

          const semanticChange =
            next.name !==
              currentDefinition.name ||
            next.unit !==
              currentDefinition.unit ||
            next.valueType !==
              currentDefinition.valueType ||
            JSON.stringify(
              next.ordinalOptions
            ) !==
              JSON.stringify(
                currentDefinition.ordinalOptions
              );

          if (
            semanticChange &&
            uses.length &&
            !input.confirmed
          ) {
            throw new PreparationError(
              "Confirmá el cambio de definición y revisá los valores existentes en todas las partidas asociadas."
            );
          }

          const existingValues =
            await tx
              .select()
              .from(
                gameStateValues
              )
              .where(
                eq(
                  gameStateValues.kpiDefinitionId,
                  currentDefinition.id
                )
              );

          /*
           * No convertimos automáticamente entre
           * número y nivel.
           */
          for (
            const value of
            existingValues
          ) {
            const raw =
              next.valueType ===
              "numeric"
                ? value.value
                : value.ordinalKey;

            if (
              raw === null
            ) {
              throw new PreparationError(
                "El KPI tiene valores preparados incompatibles con el nuevo tipo. Quitá esos valores antes de cambiar entre numérico y por niveles."
              );
            }

            normalizeValue(
              raw,
              next
            );
          }

          uses.forEach(
            (association) =>
              affected.add(
                association.gameId
              )
          );

          /*
           * Actualizamos primero la definición.
           */
          await tx
            .update(
              kpiDefinitions
            )
            .set({
              ...databaseDefinition(
                next
              ),

              updatedAt:
                new Date(),
            })
            .where(
              eq(
                kpiDefinitions.id,
                currentDefinition.id
              )
            );

          const oldOptions =
            currentDefinition.ordinalOptions;

          /*
           * Si deja de ser ordinal, no puede haber
           * valores ordinales (validado arriba), por
           * lo que las opciones pueden eliminarse.
           */
          if (
            next.valueType ===
            "numeric"
          ) {
            if (
              oldOptions.length
            ) {
              await tx
                .delete(
                  kpiOrdinalOptions
                )
                .where(
                  eq(
                    kpiOrdinalOptions.kpiDefinitionId,
                    currentDefinition.id
                  )
                );
            }
          } else {
            /*
             * Las opciones utilizadas no pueden
             * desaparecer.
             */
            const referencedKeys =
              new Set(
                existingValues
                  .map(
                    (value) =>
                      value.ordinalKey
                  )
                  .filter(
                    (
                      key
                    ): key is string =>
                      key !== null
                  )
              );

            const newKeys =
              new Set(
                next.ordinalOptions.map(
                  (option) =>
                    option.key
                )
              );

            for (
              const key of
              referencedKeys
            ) {
              if (
                !newKeys.has(key)
              ) {
                throw new PreparationError(
                  `La opción "${key}" está siendo utilizada y no puede eliminarse.`
                );
              }
            }

            const existingKeys =
              new Set(
                oldOptions.map(
                  (option) =>
                    option.key
                )
              );

            /*
             * Movemos temporalmente las posiciones
             * existentes para permitir reordenarlas
             * sin chocar con UNIQUE(kpi, position).
             */
            for (
              let index = 0;
              index <
              oldOptions.length;
              index++
            ) {
              await tx
                .update(
                  kpiOrdinalOptions
                )
                .set({
                  position:
                    100000 +
                    index,
                })
                .where(
                  and(
                    eq(
                      kpiOrdinalOptions.kpiDefinitionId,
                      currentDefinition.id
                    ),
                    eq(
                      kpiOrdinalOptions.key,
                      oldOptions[
                        index
                      ].key
                    )
                  )
                );
            }

            /*
             * Insertamos opciones nuevas.
             */
            const additions =
              next.ordinalOptions.filter(
                (option) =>
                  !existingKeys.has(
                    option.key
                  )
              );

            if (
              additions.length
            ) {
              await tx
                .insert(
                  kpiOrdinalOptions
                )
                .values(
                  additions.map(
                    (option) => ({
                      kpiDefinitionId:
                        currentDefinition.id,

                      key:
                        option.key,

                      label:
                        option.label,

                      /*
                       * Posición temporal para no
                       * chocar antes del reordenado.
                       */
                      position:
                        200000 +
                        option.position,
                    })
                  )
                );
            }

            /*
             * Actualizamos etiqueta y posición final.
             */
            for (
              const option of
              next.ordinalOptions
            ) {
              await tx
                .update(
                  kpiOrdinalOptions
                )
                .set({
                  label:
                    option.label,

                  position:
                    option.position,
                })
                .where(
                  and(
                    eq(
                      kpiOrdinalOptions.kpiDefinitionId,
                      currentDefinition.id
                    ),
                    eq(
                      kpiOrdinalOptions.key,
                      option.key
                    )
                  )
                );
            }

            /*
             * Quitamos opciones viejas no utilizadas.
             */
            const removedKeys =
              oldOptions
                .map(
                  (option) =>
                    option.key
                )
                .filter(
                  (key) =>
                    !newKeys.has(
                      key
                    )
                );

            if (
              removedKeys.length
            ) {
              await tx
                .delete(
                  kpiOrdinalOptions
                )
                .where(
                  and(
                    eq(
                      kpiOrdinalOptions.kpiDefinitionId,
                      currentDefinition.id
                    ),
                    inArray(
                      kpiOrdinalOptions.key,
                      removedKeys
                    )
                  )
                );
            }
          }

          after = {
            ...currentDefinition,
            ...databaseDefinition(
              next
            ),

            ordinalOptions:
              next.ordinalOptions,
          };

          definition =
            after as typeof currentDefinition;
        }
      }

      /*
       * ELIMINAR DEL CATÁLOGO
       */
      else if (
        input.operation ===
        "delete_kpi"
      ) {
        const currentDefinition =
          definition!;

        if (
          !input.confirmed
        ) {
          throw new PreparationError(
            "Confirmá la eliminación del catálogo."
          );
        }

        if (
          currentDefinition.historicalUsedAt ||
          context.associations.some(
            (association) =>
              association.kpiDefinitionId ===
              currentDefinition.id
          )
        ) {
          throw new PreparationError(
            "Primero quitá el KPI de sus partidas. Un KPI histórico no puede eliminarse."
          );
        }

        const values =
          await tx
            .select({
              id:
                gameStateValues.id,
            })
            .from(
              gameStateValues
            )
            .where(
              eq(
                gameStateValues.kpiDefinitionId,
                currentDefinition.id
              )
            );

        if (
          values.length
        ) {
          throw new PreparationError(
            "El KPI conserva valores y no puede eliminarse."
          );
        }

        /*
         * Las opciones pertenecen a la definición.
         */
        await tx
          .delete(
            kpiOrdinalOptions
          )
          .where(
            eq(
              kpiOrdinalOptions.kpiDefinitionId,
              currentDefinition.id
            )
          );

        await tx
          .delete(
            kpiDefinitions
          )
          .where(
            eq(
              kpiDefinitions.id,
              currentDefinition.id
            )
          );
      }

      /*
       * ASOCIACIÓN KPI ↔ PARTIDA
       */
      else {
        const currentDefinition =
          definition!;

        const association =
          context.associations.find(
            (candidate) =>
              candidate.gameId ===
                game.id &&
              candidate.kpiDefinitionId ===
                currentDefinition.id
          );

        await preparation(
          tx,
          game.id,
          game.campaignId,
          actorId
        );

        before =
          association ?? null;

        if (
          input.operation ===
          "add_kpi"
        ) {
          if (association) {
            throw new PreparationError(
              "El KPI ya está asociado a esta partida."
            );
          }

          if (
            !currentDefinition.active
          ) {
            throw new PreparationError(
              "El KPI no está disponible para nuevas asociaciones."
            );
          }

          const required =
            input.required ??
            currentDefinition.required;
          const source = predecessor.find(k => k.id === currentDefinition.id);

          await tx
            .insert(gameKpis)
            .values({
              gameId:
                game.id,

              kpiDefinitionId:
                currentDefinition.id,

              campaignId:
                game.campaignId,

              required,
              origin: source ? "inherited" : "new",

              createdBy:
                actorId,
            });

          if (source && (source.value !== null || source.ordinalKey !== null)) {
            const state = await preparation(tx, game.id, game.campaignId, actorId);
            await tx.insert(gameStateValues).values({ gameId: game.id, campaignId: game.campaignId, stateSetId: state.id, kpiDefinitionId: currentDefinition.id, value: source.value, ordinalKey: source.ordinalKey });
          }
          after = {
            kpiId:
              currentDefinition.id,

            required,
            origin: source ? "inherited" : "new",
          };
        } else {
          if (
            !association
          ) {
            throw new PreparationError(
              "La asociación no existe o tiene uso histórico."
            );
          }

          if (
            input.operation ===
            "remove_kpi"
          ) {
            if (
              !input.confirmed
            ) {
              throw new PreparationError(
                "Confirmá quitar el KPI y su valor de esta partida."
              );
            }

            const state =
              await preparation(
                tx,
                game.id,
                game.campaignId,
                actorId
              );

            const [value] =
              await tx
                .select()
                .from(
                  gameStateValues
                )
                .where(
                  and(
                    eq(
                      gameStateValues.stateSetId,
                      state.id
                    ),
                    eq(
                      gameStateValues.kpiDefinitionId,
                      currentDefinition.id
                    )
                  )
                );

            if (value) {
              removedValues[
                game.id
              ] =
                serializedValue(
                  value
                );
            }

            await tx
              .delete(
                gameStateValues
              )
              .where(
                and(
                  eq(
                    gameStateValues.stateSetId,
                    state.id
                  ),
                  eq(
                    gameStateValues.kpiDefinitionId,
                    currentDefinition.id
                  )
                )
              );

            await tx
              .delete(gameKpis)
              .where(
                and(
                  eq(
                    gameKpis.gameId,
                    game.id
                  ),
                  eq(
                    gameKpis.kpiDefinitionId,
                    currentDefinition.id
                  )
                )
              );
          } else {
            if (
              typeof input.required !==
              "boolean"
            ) {
              throw new PreparationError(
                "Indicá la obligatoriedad de esta partida."
              );
            }

            await tx
              .update(gameKpis)
              .set({
                required:
                  input.required,
              })
              .where(
                and(
                  eq(
                    gameKpis.gameId,
                    game.id
                  ),
                  eq(
                    gameKpis.kpiDefinitionId,
                    currentDefinition.id
                  )
                )
              );

            after = {
              ...association,
              required:
                input.required,
            };
          }
        }
      }

      /*
       * REVISIONES + AUDITORÍA
       */
      let revision = 0;

      for (
        const affectedGameId of
        [...affected].sort()
      ) {
        const state =
          await preparation(
            tx,
            affectedGameId,
            game.campaignId,
            actorId
          );

        if (
          state.frozenAt
        ) {
          throw new PreparationError(
            "Una preparación afectada está congelada."
          );
        }

        const nextRevision =
          state.revision + 1;

        await tx
          .update(gameStateSets)
          .set({
            revision:
              nextRevision,

            updatedBy:
              actorId,

            updatedAt:
              new Date(),
          })
          .where(
            eq(
              gameStateSets.id,
              state.id
            )
          );

        await tx
          .insert(
            gamePreparationChanges
          )
          .values({
            operationId:
              affectedGameId ===
              game.id
                ? input.operationId
                : randomUUID(),

            campaignId:
              game.campaignId,

            stateSetId:
              state.id,

            actorId,

            operation:
              input.operation,

            requestHash,

            previousRevision:
              state.revision,

            revision:
              nextRevision,

            details: {
              requestId:
                input.operationId,

              kpiId:
                definition?.id,

              definitionBefore:
                input.operation ===
                  "edit_kpi" ||
                input.operation ===
                  "delete_kpi"
                  ? before
                  : undefined,

              before,

              after,

              removedValue:
                removedValues[
                  affectedGameId
                ] ?? null,
            },
          });

        if (
          affectedGameId ===
          game.id
        ) {
          revision =
            nextRevision;
        }
      }

      return {
        replayed: false,
        revision,
      };
    }
  );
}
