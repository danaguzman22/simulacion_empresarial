import { PreparationError, UUID_PATTERN, normalizeValue } from "@/features/preparation/domain/preparation";
export class RuleError extends PreparationError {}
export type RuleDefinition={name:string;description:string;triggerType:string;enabled:boolean;position:number;visibility:"display"|"master_only";displayMessage:string;effects:Array<{kpiId:string;amount:string}>};
type Target=Parameters<typeof normalizeValue>[1]&{id:string};
export function validateRule(input:RuleDefinition,definitions:Target[]){
 if(!input.name.trim()||input.name.trim().length>160||input.description.length>5000||input.displayMessage.length>5000||input.triggerType!=="round_end"||!["display","master_only"].includes(input.visibility)||!Number.isSafeInteger(input.position)||input.position<0||input.position>2147483647)throw new RuleError("Completá una regla válida: nombre, momento y orden.");
 if(!Array.isArray(input.effects)||input.effects.length>100||(input.enabled&&!input.effects.length))throw new RuleError("Una regla habilitada necesita al menos un efecto.");
 const seen=new Set<string>();
 const effects=input.effects.map(e=>{
  if(!UUID_PATTERN.test(e.kpiId)||seen.has(e.kpiId))throw new RuleError("No repitas un indicador en la misma regla.");seen.add(e.kpiId);
  const d=definitions.find(d=>d.id===e.kpiId);if(!d||d.valueType!=="numeric")throw new RuleError("Seleccioná un indicador numérico de esta partida.");
  if(typeof e.amount!=="string"||e.amount.length>64)throw new RuleError("Cambio inválido.");
  const amount=normalizeValue(e.amount.trim().replace(/^\+/,""),{...d,allowsNegative:true});if(amount===null)throw new RuleError("Completá el cambio del efecto.");return {kpiId:e.kpiId,amount};
 });
 return {...input,name:input.name.trim(),description:input.description.trim(),displayMessage:input.displayMessage.trim(),effects};
}
