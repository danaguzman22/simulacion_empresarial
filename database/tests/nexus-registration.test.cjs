const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,Object,String,
  require:name=>name.startsWith('@/')?load(base+'/src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):(()=>{throw new Error('unexpected import '+name)})()});return exports;}
const {validateRegistration,validateReason,normalizeForCompare,possibleDuplicate,institutionKindLabels,NexusError}=load(base+'/src/features/nexus/domain/registration.ts');
const ok={name:'  Universidad  Uno ',kind:'educational',locality:' Córdoba ',message:''};

// D-41: name, type, locality (required) and an optional message; trimmed; length limits; no HTML.
assert.deepEqual({...validateRegistration(ok)},{name:'Universidad  Uno',kind:'educational',locality:'Córdoba',message:''});
const bad=(input,pattern)=>assert.throws(()=>validateRegistration({...ok,...input}),e=>e instanceof NexusError&&pattern.test(e.message),JSON.stringify(input));
bad({kind:'school'},/tipo/);bad({kind:undefined},/tipo/);
bad({name:'U'},/Nombre: entre 2 y 160/);bad({name:'x'.repeat(161)},/Nombre/);bad({name:'<b>Uni</b>'},/Nombre: no puede tener/);
bad({locality:''},/Localidad: entre 2 y 120/);bad({locality:null},/Localidad/);bad({locality:'x'.repeat(121)},/Localidad/);bad({locality:'Cba >'},/Localidad: no puede tener/);
bad({message:'x'.repeat(1001)},/Mensaje: hasta 1000/);bad({message:'<script>'},/Mensaje: no puede tener/);bad({name:['Uni']},/Nombre: valor inválido/);
assert.equal(validateRegistration({...ok,message:null}).message,'');
// D-43: the rejection reason is required.
assert.equal(validateReason('  Falta la sede  '),'Falta la sede');
for(const reason of ['',null,'ab','x'.repeat(1001),'<a>'])assert.throws(()=>validateReason(reason),NexusError,String(reason));
assert.equal(institutionKindLabels.educational,'Educativa');
console.log('PASS registration form: required fields, trimmed, length limits, no HTML; rejection reason required');

// Duplicates: same name and locality without upper case, accents or extra spaces.
assert.equal(normalizeForCompare('  Universidad   Tecnológica  NACIONAL '),'universidad tecnologica nacional');
assert.equal(possibleDuplicate({name:'universidad tecnologica',locality:'CORDOBA'},{name:'Universidad Tecnológica',locality:'Córdoba'}),true);
assert.equal(possibleDuplicate({name:'Universidad Tecnológica',locality:'Rosario'},{name:'Universidad Tecnológica',locality:'Córdoba'}),false,'another branch');
assert.equal(possibleDuplicate({name:'Otra',locality:'Córdoba'},{name:'Universidad',locality:'Córdoba'}),false);
assert.equal(possibleDuplicate({name:'UTN',locality:'Córdoba'},{name:'utn',locality:null}),true,'an institution without locality (before 0034) with the same name could be the same');
console.log('PASS duplicates: same name and locality ignoring case, accents and spaces; another locality is another branch');
