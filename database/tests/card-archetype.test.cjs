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
for(const p of presets){const text=JSON.stringify(p);assert(!/\$[^$]*\$/.test(text)&&!/\\[a-zA-Z]+\{/.test(text),`LaTeX in template ${p.id}`);}
assert(JSON.stringify(presets.find(p=>p.id==='zorro')).includes('tirar 2d12 y quedarse'));
console.log('PASS templates without LaTeX');
