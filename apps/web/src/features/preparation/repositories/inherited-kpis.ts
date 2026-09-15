import "server-only";
import { sql } from "drizzle-orm";
import type { Transaction } from "./preparation.repository";
export async function inheritedKpiIds(tx: Transaction, gameId: string) {
 const rows = await tx.execute<{ id: string }>(sql`select kpi_definition_id as id from public.game_kpis where game_id=${gameId} and origin='inherited'`);
 return new Set(rows.map(r => r.id));
}
export async function predecessorKpis(tx: Transaction, gameId: string) {
 return tx.execute<{ id: string; required: boolean; sourceId: string; value: string | null; ordinalKey: string | null }>(sql`
 select k.kpi_definition_id as id,k.required,p.source_state_set_id as "sourceId",v.value::text as value,v.ordinal_key as "ordinalKey"
 from public.game_state_sets p join public.game_state_sets source on source.id=p.source_state_set_id
 join public.game_kpis k on k.game_id=source.game_id
 left join public.game_state_values v on v.state_set_id=source.id and v.kpi_definition_id=k.kpi_definition_id
 where p.game_id=${gameId} and p.phase='preparation'`);
}
