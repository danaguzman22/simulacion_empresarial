export type RoundOperation="start"|"pause"|"resume"|"finish";
export const roundLabels={pending:"En espera",active:"En curso",paused:"Pausada",completed:"Finalizada",cancelled:"Cancelada"};
export class RoundError extends Error {}
export function assertTransition(status:string,operation:RoundOperation){const expected={start:"pending",pause:"active",resume:"paused",finish:"active"};if(operation==="finish"?(status!=="active"&&status!=="paused"):status!==expected[operation])throw new RoundError("La ronda cambió de estado. Actualizá los datos.");}
export function remainingMilliseconds(round:{status:string;endsAt:string|null;remainingMs:number|null},serverNow:number){return round.status==="active"&&round.endsAt?Math.max(0,Date.parse(round.endsAt)-serverNow):round.status==="paused"?round.remainingMs??0:0;}
