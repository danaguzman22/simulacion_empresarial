const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,Object,String,Number,
  require:name=>name.startsWith('@/')?load(base+'/src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):(()=>{throw new Error('unexpected import '+name)})()});return exports;}
const A=load(base+'/src/features/cards/domain/archetype.ts');
const presets=load(base+'/src/features/cards/domain/card-presets.ts').cardPresets;
const {resolveArchetype,isArchetype,archetypes,archetypeInfo,departmentColor,departmentPalette,cardAccent}=A;

// #106 / D-46: deduction on read for cards created before 0035 (archetype null).
assert.equal(resolveArchetype(null,'El Búho'),'buho');
assert.equal(resolveArchetype(null,'  el   BÚHO '),'buho','case and extra spaces do not matter');
assert.equal(resolveArchetype(null,'El Búho'),'buho','decomposed accents are the same text');
assert.equal(resolveArchetype(undefined,'El Zorro'),'zorro');assert.equal(resolveArchetype(null,'El Castor'),'castor');
assert.equal(resolveArchetype(null,'El Toro'),'toro');assert.equal(resolveArchetype(null,'La Ardilla'),'ardilla');
for(const [emoji,key] of [['🦉','buho'],['🦊','zorro'],['🦫','castor'],['🐂','toro'],['🐿️','ardilla'],['🐿','ardilla'],[' 🦉 ','buho']])assert.equal(resolveArchetype(null,emoji),key,emoji);
for(const other of ['','Búho','El Búho sabio','🦉 Dirección','Dirección','B?ho','🦁','El Leon'])assert.equal(resolveArchetype(null,other),'ninguno',other);
console.log('PASS deduction: exact template text or its emoji alone; anything else is ninguno');

// A value set explicitly always wins, also "ninguno" on a card whose text matches a template.
assert.equal(resolveArchetype('toro','El Búho'),'toro');assert.equal(resolveArchetype('ninguno','El Búho'),'ninguno');
assert.equal(resolveArchetype('unknown','El Zorro'),'zorro','an invalid stored value is ignored');
assert.deepEqual([...archetypes],['buho','zorro','castor','toro','ardilla','ninguno']);
assert.equal(isArchetype('castor'),true);assert.equal(isArchetype('Castor'),false);assert.equal(isArchetype(null),false);
console.log('PASS explicit archetype wins over the deduction; only the six values are valid');

// Every NEXUS template is named after its archetype and its own text deduces to it.
assert.equal(presets.length,5);
for(const p of presets){assert(isArchetype(p.id),p.id);assert.equal(resolveArchetype(null,p.fields.visualIdentity),p.id,p.id);}
console.log('PASS templates: buho, zorro, castor, toro, ardilla');

// Colors: archetype palette; without archetype, a fixed palette of 8 by department (stable, case and accents ignored).
assert.deepEqual(Object.fromEntries(Object.entries(archetypeInfo).map(([k,v])=>[k,v.color])),{buho:'#5f92e0',zorro:'#ef8f4e',castor:'#45b189',toro:'#e05f5f',ardilla:'#e6b23c'});
assert.equal(departmentPalette.length,8);
for(const c of departmentPalette)assert(!Object.values(archetypeInfo).some(a=>a.color===c),'department colors differ from archetype colors');
assert.equal(departmentColor('Recursos Humanos'),departmentColor('  recursos   HUMANOS '));assert.equal(departmentColor('Dirección'),departmentColor('direccion'));
assert(departmentPalette.includes(departmentColor('Logística')));
assert.equal(cardAccent({archetype:'zorro',department:'Ventas'}),'#ef8f4e');
assert.equal(cardAccent({archetype:'ninguno',department:'Ventas'}),departmentColor('Ventas'));
console.log('PASS colors: archetype palette, department palette of 8');

// Templates are plain text: no LaTeX leftovers like $2\text{d}12$ (they used to reach the cards as is).
// Dollar amounts ($7.000) are fine; LaTeX commands (\text{…}) are not, inside $…$ or alone.
for(const p of presets){const text=JSON.stringify(p);assert(!/\\\\[a-zA-Z]+\{/.test(text)&&!/\$[^$\s]*\\\\/.test(text),`LaTeX in template ${p.id}`);}
assert(/\\\\[a-zA-Z]+\{/.test(JSON.stringify({d:'tirar $2\\text{d}12$'})),'the check catches the old LaTeX');
assert(JSON.stringify(presets.find(p=>p.id==='zorro')).includes('tirar 2d12 y quedarse'));
console.log('PASS templates without LaTeX');

// D-47: each template carries the C&D prototype's objectives, weakness and restriction, exactly.
const expected={
 buho:{pub:'Lead Time ≤ 15 días con un presupuesto ≤ $10.000 USD.',sec:'Lograr el objetivo gastando ≤ $7.000 USD.',weak:['Aversión al Riesgo','Desventaja en decisiones si el presupuesto disponible baja de $3.000 USD.'],res:['Revelación tardía','Revela su meta secreta recién en la Ronda 3.','private']},
 zorro:{pub:'Garantizar la satisfacción del cliente principal.',sec:'El cliente tolera hasta 20 días de plazo si la calidad es consistente.',weak:['Sobrevender','Penalización general de −2 si incumple un plazo que prometió.'],res:['Tolerancia oculta','Oculta la tolerancia de 20 días hasta que haya riesgo de quiebra en R4.','private']},
 castor:{pub:'Modernizar la tecnología de la planta.',sec:'Comprar el software ERP ($8.000 USD) en la Ronda 1 o 2.',weak:['Perfeccionismo','−2 en Negociación si la mesa rechaza el ERP en R1 o R2.'],res:['Rigor técnico','Bloquea propuestas informales que no pasen una tirada de Análisis CD 9.','public']},
 toro:{pub:'Resolver la capacidad física del taller.',sec:'Comprar el Adaptador CNC ($2.500 USD) en la Ronda 1 o 2.',weak:['Intolerancia a la burocracia','−2 en sus tiradas si la mesa debate sobre software más de 3 minutos.'],res:['Rechazo al gasto en software','Vota en contra de todo gasto en software superior a $5.000 USD.','public']},
 ardilla:{pub:'Mantener el flujo de caja positivo.',sec:'Reducir el inventario ($1.000 USD por semana) mediante un sistema Pull.',weak:['Resistencia al cambio','−2 en sus tiradas durante la ronda siguiente a un evento financiero imprevisto.'],res:['Tope de gasto','Bloquea todo gasto superior a $5.000 USD, salvo que Dirección use Visión Sistémica.','public']},
};
assert.deepEqual(JSON.parse(JSON.stringify(presets.map(p=>p.id))).sort(),Object.keys(expected).sort());
for(const p of presets){
 const e=expected[p.id],plain=x=>JSON.parse(JSON.stringify(x));
 assert.equal(p.fields.individualObjective,e.pub,p.id+' public objective');assert.equal(p.fields.secretObjective,e.sec,p.id+' secret objective');
 assert.deepEqual(plain(p.weaknesses),[{name:e.weak[0],description:'',condition:'',consequence:e.weak[1]}],p.id+' weakness');
 assert.deepEqual(plain(p.restrictions),[{name:e.res[0],description:e.res[1],condition:'',visibility:e.res[2]}],p.id+' restriction');
}
console.log('PASS templates carry the C&D objectives, weakness and restriction (secret-related restrictions private)');
