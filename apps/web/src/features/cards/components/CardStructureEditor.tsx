"use client";
import { useState, useTransition } from "react";
import { addModifierAction } from "../application/card-actions";
import { type CardScope } from "../domain/card";
import { abilityTypes, builtInModifiers, type CardStructure, type ModifierDefinition } from "../domain/card-structure";

const input = "mt-1 block w-full rounded-xl border border-white/15 bg-slate-950 p-2 text-sm";
type Props = { scope: CardScope; value: CardStructure; onChange: (value: CardStructure) => void; catalogue: ModifierDefinition[] };
export function CardStructureEditor({ scope, value, onChange, catalogue }: Props) {
  const [added, setAdded] = useState<ModifierDefinition[]>([]);
  const [customName,setCustomName] = useState("");
  const [abbreviation,setAbbreviation] = useState("");
  const [error,setError] = useState("");
  const [pending,startTransition] = useTransition();
  const options = [...new Map([...builtInModifiers,...catalogue,...added,...value.configuredModifiers].map(m => [m.key,m])).values()];
  function createModifier() {
    setError("");
    startTransition(async () => {
      try {
        const result = await addModifierAction(scope, customName, abbreviation);
        if (!result.definition) { setError(result.error ?? "No se pudo guardar."); return; }
        setAdded(old => [...old,result.definition]);setCustomName("");setAbbreviation("");
        // Persisting a definition does not mutate the card until its form is saved.
      } catch { setError("No se pudo guardar. Intentá nuevamente."); }
    });
  }
  return <>
    <input type="hidden" name="structure" value={JSON.stringify(value)} />
    <details className="rounded-xl border border-white/15 p-3"><summary className="cursor-pointer font-bold">Modificadores ({value.configuredModifiers.length})</summary>
      <div className="mt-3 space-y-3">{options.map(m => {
        const selected = value.configuredModifiers.find(v => v.key===m.key);
        return <div key={m.key} className="flex items-center gap-3"><label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={!!selected} onChange={e => onChange({...value,configuredModifiers:e.target.checked ? [...value.configuredModifiers,{key:m.key,name:m.name,abbreviation:m.abbreviation,value:0}] : value.configuredModifiers.filter(v=>v.key!==m.key)})} />{m.abbreviation} — {m.name}</label>
          {selected && <label className="w-24 text-xs">Valor<input type="number" step="1" min="-2147483648" max="2147483647" required value={selected.value} onChange={e=>onChange({...value,configuredModifiers:value.configuredModifiers.map(v=>v.key===m.key?{...v,value:e.target.value===""?0:Number(e.target.value)}:v)})} className={input} /></label>}
        </div>;
      })}</div>
      <div className="mt-4 rounded-xl border border-dashed border-white/15 p-3"><p className="text-sm">Crear modificador personalizado</p><label className="block text-sm">Nombre<input value={customName} maxLength={160} onChange={e=>setCustomName(e.target.value)} className={input} /></label><label className="block text-sm">Abreviatura<input value={abbreviation} maxLength={16} onChange={e=>setAbbreviation(e.target.value)} className={input} /></label>
        <button type="button" disabled={pending || !customName.trim() || !abbreviation.trim()} onClick={createModifier} className="mt-3 rounded-xl border border-sky-400 px-3 py-2 disabled:opacity-50">{pending?"Guardando…":"Crear en mi catálogo"}</button>
        <p className="mt-2 text-xs text-slate-400">Después seleccioná el modificador y configurá su valor para esta ficha.</p>{error&&<p role="alert" className="text-red-300">{error}</p>}
      </div>
    </details>
    <details className="rounded-xl border border-white/15 p-3"><summary className="cursor-pointer font-bold">Habilidades del personaje ({value.abilities.length})</summary>
      {value.abilities.map((a,index)=><fieldset key={index} className="mt-4 space-y-2 rounded-xl bg-slate-950/50 p-3"><legend>Habilidad {index+1}</legend>
        {([['name','Nombre'],['description','Descripción'],['condition','Condición de activación']] as const).map(([key,label])=><label key={key} className="block text-sm">{label}<textarea value={a[key]} maxLength={key==='name'?160:5000} required={key!=='condition'} rows={key==='name'?1:3} className={input} onChange={e=>onChange({...value,abilities:value.abilities.map((v,i)=>i===index?{...v,[key]:e.target.value}:v)})}/></label>)}
        <label className="block text-sm">Tipo<select value={a.type} className={input} onChange={e=>onChange({...value,abilities:value.abilities.map((v,i)=>i===index?{...v,type:e.target.value as typeof a.type}:v)})}>{Object.entries(abilityTypes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block text-sm">Límite de uso (vacío = sin límite)<input type="number" min="1" max="2147483647" step="1" value={a.useLimit??''} className={input} onChange={e=>onChange({...value,abilities:value.abilities.map((v,i)=>i===index?{...v,useLimit:e.target.value===''?null:Number(e.target.value),useScope:e.target.value===''?null:v.useScope??'game'}:v)})}/></label>
        {a.useLimit!==null&&<label className="block text-sm">Alcance<select value={a.useScope??'game'} className={input} onChange={e=>onChange({...value,abilities:value.abilities.map((v,i)=>i===index?{...v,useScope:e.target.value as 'game'|'round'}:v)})}><option value="game">Por partida</option><option value="round">Por ronda</option></select></label>}
        <button type="button" className="text-sm text-red-300" onClick={()=>onChange({...value,abilities:value.abilities.filter((_,i)=>i!==index)})}>Quitar habilidad</button>
      </fieldset>)}
      <button type="button" disabled={value.abilities.length>=50} className="mt-3 text-sky-300" onClick={()=>onChange({...value,abilities:[...value.abilities,{name:'',type:'active',description:'',condition:'',useLimit:null,useScope:null}]})}>+ Agregar habilidad</button>
    </details>
    <details className="rounded-xl border border-white/15 p-3"><summary className="cursor-pointer font-bold">Debilidades ({value.weaknesses.length})</summary>
      {value.weaknesses.map((w,index)=><fieldset key={index} className="mt-4 space-y-2 rounded-xl bg-slate-950/50 p-3"><legend>Debilidad {index+1}</legend>
        {([['name','Nombre'],['description','Descripción'],['condition','Condición'],['consequence','Consecuencia o penalización']] as const).map(([key,label])=><label key={key} className="block text-sm">{label}<textarea value={w[key]} required={key==='name'||key==='consequence'} maxLength={key==='name'?160:5000} rows={key==='name'?1:3} className={input} onChange={e=>onChange({...value,weaknesses:value.weaknesses.map((v,i)=>i===index?{...v,[key]:e.target.value}:v)})}/></label>)}
        <button type="button" className="text-sm text-red-300" onClick={()=>onChange({...value,weaknesses:value.weaknesses.filter((_,i)=>i!==index)})}>Quitar debilidad</button>
      </fieldset>)}
      <button type="button" disabled={value.weaknesses.length>=50} className="mt-3 text-sky-300" onClick={()=>onChange({...value,weaknesses:[...value.weaknesses,{name:'',description:'',condition:'',consequence:''}]})}>+ Agregar debilidad</button>
    </details>
    <details className="rounded-xl border border-white/15 p-3"><summary className="cursor-pointer font-bold">Restricciones ({value.restrictions.length})</summary>
      {value.restrictions.map((r,index)=><fieldset key={index} className="mt-4 space-y-2 rounded-xl bg-slate-950/50 p-3"><legend>Restricción {index+1}</legend>
        {([['name','Nombre'],['description','Descripción'],['condition','Condición o excepción']] as const).map(([key,label])=><label key={key} className="block text-sm">{label}<textarea value={r[key]} required={key!=='condition'} maxLength={key==='name'?160:5000} rows={key==='name'?1:3} className={input} onChange={e=>onChange({...value,restrictions:value.restrictions.map((v,i)=>i===index?{...v,[key]:e.target.value}:v)})}/></label>)}
        <label className="block text-sm">Visibilidad<select value={r.visibility} className={input} onChange={e=>onChange({...value,restrictions:value.restrictions.map((v,i)=>i===index?{...v,visibility:e.target.value as 'public'|'private'}:v)})}><option value="public">Pública</option><option value="private">Privada · Solo Master</option></select></label>
        <button type="button" className="text-sm text-red-300" onClick={()=>onChange({...value,restrictions:value.restrictions.filter((_,i)=>i!==index)})}>Quitar restricción</button>
      </fieldset>)}
      <button type="button" disabled={value.restrictions.length>=50} className="mt-3 text-sky-300" onClick={()=>onChange({...value,restrictions:[...value.restrictions,{name:'',description:'',condition:'',visibility:'public'}]})}>+ Agregar restricción</button>
    </details>
  </>;
}
