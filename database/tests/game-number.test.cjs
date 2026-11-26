const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,Object,String,Number,
  require:name=>name.startsWith('@/')?load(base+'/src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):(()=>{throw new Error('unexpected import '+name)})()});return exports;}
const {gameNumber}=load(base+'/src/features/games/domain/game.ts');

// #111: the database keeps numbering games from 0; every screen shows the number plus 1.
assert.equal(gameNumber(0),1,'the first game of a campaign is Partida 1');
assert.equal(gameNumber(1),2);assert.equal(gameNumber(41),42);
console.log('PASS game number: sequence 0 is shown as Partida 1');

// No screen shows a game's sequence as is: every game.sequence / source.sequence in a component goes through gameNumber.
const files=[];(function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='maqueta')walk(p);}else if(p.endsWith('.tsx'))files.push(p);}})(base+'/src');
const raw=[];
for(const f of files){const text=fs.readFileSync(f,'utf8');for(const m of text.matchAll(/\b(game|source)\.sequence\b/g)){const before=text.slice(Math.max(0,m.index-40),m.index);if(!/gameNumber\(\s*$/.test(before))raw.push(path.relative(base,f)+': '+m[0]);}}
assert.deepEqual(raw,[],'game sequence shown without gameNumber');
console.log('PASS screens: no game sequence shown without gameNumber ('+files.length+' components checked)');
