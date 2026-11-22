const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,Object,String,Number,
  require:name=>name.startsWith('@/')?load(base+'/src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):(()=>{throw new Error('unexpected import '+name)})()});return exports;}
const R=load(base+'/src/features/nexus/domain/registration.ts');
const {validateRegistration,validateStep,validateReason,validCuit,normalizeTaxId,normalizeForCompare,samePlaceAndName,emptyDraft,institutionKindLabels,argentineProvinces,NexusError}=R;
const plain=x=>JSON.parse(JSON.stringify(x));
const ok={...emptyDraft,legalName:'  Universidad  Uno ',kind:'educational',educationLevel:'university',country:'AR',province:'Córdoba',locality:' Córdoba ',postalCode:'5000',
 institutionalEmail:'INFO@uno.edu.ar',institutionalPhone:'+54 351 400-0000',responsiblePosition:'Rector',responsibleArea:'Rectorado',authorized:true};

// CUIT: 11 digits and its check digit; stored without dashes. Other countries: free text in upper case.
assert.equal(validCuit('20-12345678-6'),true);assert.equal(validCuit('20123456786'),true);
for(const bad of ['20123456780','2012345678','201234567861','ab123456786',''])assert.equal(validCuit(bad),false,bad);
assert.equal(normalizeTaxId('AR','20-12345678-6'),'20123456786');assert.equal(normalizeTaxId('UY','rut 21 00'),'RUT2100');
console.log('PASS CUIT: check digit, 11 digits, normalized');

// Step 1: legal name, optional visible name, type with its extra data, organization kind, CUIT only for Argentina, https website.
const step=(n,changes)=>plain(validateStep(n,{...ok,...changes}));
assert.deepEqual(step(1,{}),{});
assert.match(step(1,{legalName:''}).legalName,/obligatorio/);assert.match(step(1,{legalName:'<b>'}).legalName,/no puede tener/);
assert.match(step(1,{kind:'school'}).kind,/tipo/);assert.match(step(1,{educationLevel:''}).educationLevel,/nivel/);
assert.deepEqual(Object.keys(step(1,{kind:'company',educationLevel:''})).sort(),['companySize','sector']);
assert.deepEqual(step(1,{kind:'company',sector:'technology',companySize:'11-50'}),{});
for(const kind of ['public_agency','ngo','other'])assert.deepEqual(step(1,{kind,educationLevel:''}),{},kind);
assert.match(step(1,{taxId:'20123456780'}).taxId,/CUIT inválido/);assert.deepEqual(step(1,{country:'UY',taxId:'RUT 2100'}),{});
assert.match(step(1,{website:'http://uno.edu.ar'}).website,/https/);assert.deepEqual(step(1,{website:'https://uno.edu.ar'}),{});
assert.match(step(1,{organizationKind:'x'}).organizationKind,/organización/);
// Step 2: Argentina requires one of the 24 provinces; other countries, free text.
assert.equal(argentineProvinces.length,24);
assert.match(step(2,{province:'Atlántida'}).province,/provincia/);assert.deepEqual(step(2,{country:'CL',province:'Región de Valparaíso'}),{});
assert.match(step(2,{postalCode:''}).postalCode,/obligatorio/);assert.match(step(2,{locality:''}).locality,/obligatorio/);
// Step 3: institutional contact required; responsible position and area required; alternate optional but complete; declaration required.
assert.match(step(3,{institutionalEmail:'nope'}).institutionalEmail,/Correo/);assert.match(step(3,{institutionalPhone:'12'}).institutionalPhone,/Teléfono/);
assert.match(step(3,{responsiblePosition:''}).responsiblePosition,/Cargo/);assert.match(step(3,{responsibleArea:''}).responsibleArea,/Área/);
assert.match(step(3,{alternatePosition:'Secretaria'}).alternateName,/obligatorio/);
assert.match(step(3,{alternateName:'Ana'}).alternateEmail,/correo o un teléfono/);
assert.deepEqual(step(3,{alternateName:'Ana Pérez',alternatePhone:'351 555 0000'}),{});
assert.match(step(3,{authorized:false}).authorized,/autorizado/);
console.log('PASS steps: required data by step, extra data by type, provinces, contacts, declaration');

// Whole registration -> normalized payload (trimmed, lower-case e-mails, extra data only for its type, CUIT digits).
const payload=plain(validateRegistration({...ok,taxId:'20-12345678-6',displayName:' UNO ',sector:'technology',alternateName:'Ana',alternateEmail:'ANA@x.com'}));
assert.equal(payload.legalName,'Universidad  Uno');assert.equal(payload.displayName,'UNO');assert.equal(payload.locality,'Córdoba');assert.equal(payload.taxId,'20123456786');
assert.equal(payload.sector,null,'sector only for companies');assert.equal(payload.institutionalEmail,'info@uno.edu.ar');
assert.deepEqual(payload.alternate,{name:'Ana',position:null,email:'ana@x.com',phone:null});assert.equal(payload.website,null);
assert.equal(validateRegistration({...ok,authorized:'yes'}).legalName,'Universidad  Uno');
assert.throws(()=>validateRegistration({...ok,authorized:false}),NexusError);assert.throws(()=>validateRegistration({...ok,legalName:['x']}),NexusError);
// The rejection reason is required: never empty or only spaces.
assert.equal(validateReason('  Falta la sede  '),'Falta la sede');
for(const reason of ['','   ',null,undefined,'ab','  ab  ','x'.repeat(1001),'<a>'])assert.throws(()=>validateReason(reason),NexusError,String(reason));
assert.equal(institutionKindLabels.public_agency,'Organismo público');
console.log('PASS registration: normalized payload, extra data only for its type, rejection reason required');

// Unique legal name + country + province + locality, ignoring case, accents and spaces (same mapping as the database).
assert.equal(normalizeForCompare('  Universidad   Tecnológica  NACIONAL '),'universidad tecnologica nacional');assert.equal(normalizeForCompare(null),'');
const place=(legalName,locality='Córdoba',province='Córdoba',country='AR')=>({legalName,locality,province,country});
assert.equal(samePlaceAndName(place('universidad tecnologica','CORDOBA','cordoba'),place('Universidad  Tecnológica')),true);
assert.equal(samePlaceAndName(place('Universidad Tecnológica','Rosario'),place('Universidad Tecnológica')),false,'another locality');
assert.equal(samePlaceAndName(place('Universidad Tecnológica','Córdoba','Santa Fe'),place('Universidad Tecnológica')),false,'another province');
assert.equal(samePlaceAndName(place('UTN'),{legalName:null,locality:null,province:null,country:null}),false,'an institution from before 0034 has no legal name');
console.log('PASS uniqueness: legal name + place ignoring case, accents and spaces; another locality or province is allowed');
