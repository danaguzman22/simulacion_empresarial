export type RoundOperation="start"|"pause"|"resume"|"finish";
export const roundLabels={pending:"En espera",active:"En curso",paused:"Pausada",completed:"Finalizada",cancelled:"Cancelada"};
export class RoundError extends Error {}
export function assertTransition(status:string,operation:RoundOperation){const expected={start:"pending",pause:"active",resume:"paused",finish:"active"};if(operation==="finish"?(status!=="active"&&status!=="paused"):status!==expected[operation])throw new RoundError("La ronda cambió de estado. Actualizá los datos.");}
export function remainingMilliseconds(round:{status:string;endsAt:string|null;remainingMs:number|null},serverNow:number){return round.status==="active"&&round.endsAt?Math.max(0,Date.parse(round.endsAt)-serverNow):round.status==="paused"?round.remainingMs??0:0;}
// #83: the single criterion for "every period finished", the same as the database (0016) and the move to evaluation:
// there is at least one period and every one is completed. A cancelled period does not count as finished.
export function allPeriodsCompleted(periods:Array<{status:string}>){return periods.length>0&&periods.every(p=>p.status==="completed");}
// What the header bar shows: the running period, the next one to start (once every earlier one is completed),
// that every period finished, or nothing. Used by the header and covered by unit tests.
export type PeriodBarState<T>={kind:"running";period:T}|{kind:"next";period:T;ready:boolean}|{kind:"all-completed"}|{kind:"none"};
export function periodBarState<T extends {status:string;sequence:number}>(periods:T[]):PeriodBarState<T>{
 const running=periods.find(p=>p.status==="active"||p.status==="paused");if(running)return {kind:"running",period:running};
 if(allPeriodsCompleted(periods))return {kind:"all-completed"};
 const next=[...periods].sort((x,y)=>x.sequence-y.sequence).find(p=>p.status==="pending");
 if(next)return {kind:"next",period:next,ready:periods.filter(p=>p.sequence<next.sequence).every(p=>p.status==="completed")};
 return {kind:"none"};
}
