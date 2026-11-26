const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),ts=createRequire(base+'/package.json')('typescript');
const load=file=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,
 {exports,require:name=>name==='next/link'||name==='next/navigation'?{}:name==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:name==='@/components/shared/Breadcrumbs'?load(base+'/src/components/shared/Breadcrumbs.tsx'):(()=>{throw new Error('unexpected import '+name)})()});return exports;};
const {backCrumb}=load(base+'/src/components/shared/Breadcrumbs.tsx');
const plain=x=>JSON.parse(JSON.stringify(x));

// #100: every detail screen gets "← Volver a <anterior>" from its route: the last linked part before the current one.
assert.deepEqual(plain(backCrumb([{label:'Panel',href:'/master'},{label:'Empresa',href:'/master/empresas/1'},{label:'Campaña'}])),{label:'Empresa',href:'/master/empresas/1'});
assert.deepEqual(plain(backCrumb([{label:'Panel',href:'/master'},{label:'Empresa'},{label:'Campaña',href:'/c'},{label:'Partida'}])),{label:'Campaña',href:'/c'});
assert.deepEqual(plain(backCrumb([{label:'Panel',href:'/master'},{label:'Empresa sin acceso'},{label:'Campaña'}])),{label:'Panel',href:'/master'},'a part without a link is skipped');
assert.deepEqual(plain(backCrumb([{label:'Mis partidas',href:'/alumno'},{label:'Partida'}])),{label:'Mis partidas',href:'/alumno'});
assert.equal(backCrumb([{label:'Solo'}]),null);assert.equal(backCrumb([]),null);
assert.equal(backCrumb([{label:'Sin enlace'},{label:'Actual'}]),null,'nothing to go back to: no button');
assert.deepEqual(plain(backCrumb([{label:'A',href:'/a'},{label:'Actual',href:'/actual'}])),{label:'A',href:'/a'},'the current part is never the target, even with a link');
console.log('PASS back button: last linked part before the current one, none when there is nothing to go back to');

// No screen draws its own "← Volver a …": they come from Breadcrumbs. Only the logins (no route) have one, to the home page.
const files=[];(function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='maqueta')walk(p);}else if(p.endsWith('.tsx'))files.push(p);}})(base+'/src');
const own=files.filter(f=>/←\s*Volver|>\s*Volver a/.test(fs.readFileSync(f,'utf8'))).map(f=>path.relative(base+'/src',f).split(path.sep).join('/')).sort();
assert.deepEqual(own,['app/login/alumno/page.tsx','app/login/master/page.tsx','components/shared/Breadcrumbs.tsx']);
for(const f of ['app/login/alumno/page.tsx','app/login/master/page.tsx'])assert(fs.readFileSync(base+'/src/'+f,'utf8').includes('← Volver a la portada'),f);
console.log('PASS screens: "Volver" only from Breadcrumbs; both logins say "← Volver a la portada"');

// The game's route inside a card of its Fichas tab: back to Fichas from the card, back to the card from its editor.
const {gameCrumbItems}=load(base+'/src/features/games/components/GameCrumbs.tsx');
const g='/master/partidas/g1',items=[{label:'Panel',href:'/master'},{label:'Empresa',href:'/e'},{label:'Campaña',href:'/c'},{label:'Partida'}];
for(const p of [g,g+'/fichas',g+'/equipos',g+'/fichas/'])assert.deepEqual(plain(gameCrumbItems(items,g,p)),plain(items),'tabs keep the game route: '+p);
assert.equal(backCrumb(gameCrumbItems(items,g,g+'/kpis')).label,'Campaña','a tab goes back to the campaign');
const view=plain(gameCrumbItems(items,g,g+'/fichas/abc'));
assert.deepEqual(view.slice(-3),[{label:'Partida',href:g},{label:'Fichas',href:g+'/fichas'},{label:'Ficha'}]);
assert.deepEqual(plain(backCrumb(view)),{label:'Fichas',href:g+'/fichas'});
const edit=plain(gameCrumbItems(items,g,g+'/fichas/abc/editar'));
assert.deepEqual(edit.slice(-2),[{label:'Ficha',href:g+'/fichas/abc'},{label:'Editar'}]);
assert.deepEqual(plain(backCrumb(edit)),{label:'Ficha',href:g+'/fichas/abc'});
assert.deepEqual(plain(gameCrumbItems(items,g,'/master/partidas/g10/fichas/abc')),plain(items),'another game with a longer id is not mistaken for this one');
console.log('PASS game route: tabs go back to the campaign, a card back to Fichas, its editor back to the card');
