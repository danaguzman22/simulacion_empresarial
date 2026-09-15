import "server-only";
import { sql } from "drizzle-orm";
import type { Transaction } from "./preparation.repository";
export async function inheritedKpiIds(tx: Transaction, gameId: string) {
 const rows = await tx.execute<{ id: string }>(sql`select k.kpi_definition_id as id from public.game_state_sets p join public.game_state_sets source on source.id=p.source_state_set_id join public.game_kpis k on k.game_id=source.game_id where p.game_id=${gameId} and p.phase='preparation'`);
 return new Set(rows.map(r => r.id));
}
