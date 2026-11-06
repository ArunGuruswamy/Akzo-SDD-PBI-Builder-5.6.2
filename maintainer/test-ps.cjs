'use strict';
// Runs installer/Install-PBIBuilder.ps1 with Windows PowerShell and proves it matches core.js.
// Uses the user's real execution policy: the inherited process-scope override is removed, never added.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const P=require('./src/core.js'),V21=require('./fixtures/baseline-v2.1.0-core.cjs'),V30=require('./fixtures/baseline-v3.0.0-core.cjs');
const {DirectoryHandle}=require('./fixtures/fs-handles.cjs');
const shared=require('./fixtures/readiness-cases.cjs'),CASE_PBI=shared.PBI;
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS',name)}
const env={...process.env};delete env.PSExecutionPolicyPreference;
const cmdRun=(pkg,file,args,extra={},input='')=>{const r=cp.spawnSync('cmd.exe',['/d','/s','/c',`""${path.join(pkg,file)}" ${args}"`],{encoding:'utf8',env:{...env,...extra},input,windowsVerbatimArguments:true,timeout:120000});if(r.error)throw r.error;return {code:r.status,out:r.stdout+r.stderr};};
function ps(pkg,args,script='Install-PBIBuilder.ps1'){const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(pkg,script),...args],{encoding:'utf8',env,timeout:120000});if(r.error)throw r.error;return {code:r.status,out:r.stdout,err:r.stderr};}
async function tree(dir,rel=''){const out={};for(const e of await fs.readdir(path.join(dir,rel),{withFileTypes:true})){const r=rel?rel+'/'+e.name:e.name;if(e.isDirectory())Object.assign(out,await tree(dir,r));else out[r]=(await fs.readFile(path.join(dir,r))).toString('utf8');}return out;}
// Backup batch folders are timestamped; compare their contents by original path.
const unbatch=t=>Object.fromEntries(Object.entries(t).map(([k,v])=>[k.replace(/^(playbook\/pbi-builder\/backups\/)[^/]+\//,'$1*/'),v]));
const loose=async d=>JSON.parse(await fs.readFile(d,'utf8'));
(async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-ps-'));env.USERPROFILE=tmp;// installer logs stay in the test folder
 const assets=JSON.parse(await fs.readFile(path.join(__dirname,'src/assets.json'),'utf8'));
 const html=await fs.readFile(path.join(__dirname,'Akzo-SDD-PBI-Builder.html'),'utf8');
 const pkg=path.join(tmp,'package ಕನ್ನಡ & space');await fs.mkdir(pkg);
 for(const f of ['Install-PBIBuilder.ps1','Uninstall-PBIBuilder.ps1','PBI-Builder-Setup.ps1','Install-PBIBuilder.cmd','Uninstall-PBIBuilder.cmd','Install.cmd','Uninstall.cmd'])await fs.copyFile(path.join(__dirname,'installer',f),path.join(pkg,f));
 await fs.writeFile(path.join(pkg,'pbi-builder-bundle.json'),JSON.stringify(P.bundle(assets)));await fs.writeFile(path.join(pkg,'Akzo-SDD-PBI-Builder.html'),html);
 let n=0;const repo=async()=>{const d=path.join(tmp,`repo ${++n} — ಕನ್ನಡ & co`);await fs.mkdir(path.join(d,'.git'),{recursive:true});return d;};
 // The built HTML carries the installer text, so the form writes the same playbook/pbi-builder/tools checker as PowerShell.
 const formAssets={...assets,installer:await fs.readFile(path.join(__dirname,'installer/Install-PBIBuilder.ps1'),'utf8')};
 const jsInstall=async(d,cfg,allow=false)=>{const root=new DirectoryHandle(d);return P.apply(root,await P.plan(root,P.setupFiles(cfg,formAssets,html).files,true),allow);};

 await test('PowerShell and core write identical files for the same settings (both IDEs, references on/off, Unicode, quotes, spaces)',async()=>{
  const configs=[{projectName:'Café "QA" ಕನ್ನಡ & Co \\ x',ide:'visualstudio',role:'legacy',includeReferences:true,sources:{legacy:'',dab:'..\\DAB Repo',cdms:''}},
   {projectName:'Other project',ide:'vscode',role:'dab',includeReferences:false,sources:{legacy:'../Legacy',dab:'',cdms:'../CDMS'}},
   {projectName:'Workspace',ide:'vscode',role:'other',includeReferences:true,sources:{legacy:'../L',dab:'../D',cdms:''}}];
  for(const [i,cfg] of configs.entries()){
   const a=await repo(),b=await repo();await jsInstall(a,cfg);
   let r;
   if(i===0){// Quotes in a command-line argument are unreliable in PowerShell 5.1, so this case starts from an existing config.json.
    await fs.mkdir(path.join(b,'playbook/pbi-builder'),{recursive:true});await fs.copyFile(path.join(a,P.CONFIG),path.join(b,P.CONFIG));r=ps(pkg,['-RepoPath',b]);}
   else r=ps(pkg,['-RepoPath',b,'-ProjectName',cfg.projectName,'-Ide',cfg.ide,'-Role',cfg.role,'-LegacySource',cfg.sources.legacy,'-DabSource',cfg.sources.dab,'-CdmsSource',cfg.sources.cdms,...(cfg.includeReferences?['-IncludeReferences']:['-NoReferences'])]);
   assert.equal(r.code,0,r.err+r.out);
   assert.deepEqual(await tree(b),await tree(a),cfg.projectName);
   assert.match(r.out,new RegExp('select Akzo SDD PBI Builder - '));
  }
 });
 await test('PowerShell upgrade from v2.1 matches the wizard: retires unchanged agents, keeps edited ones, preserves PBIs and knowledge',async()=>{
  const raw={projectName:'Customizations',ide:'visualstudio',role:'legacy',sources:{dab:'../DAB',legacy:'',cdms:''},includeReferences:true};
  const seed=async d=>{const root=new DirectoryHandle(d),old=V21.setupFiles(raw,assets,'HTML 2.1');await V21.apply(root,await V21.plan(root,old.files,true));
   await P.write(root,V21.CONCISE_AGENT,old.files[V21.CONCISE_AGENT]+'\nTeam note\n');await P.write(root,'playbook/pbis/existing/DECISION-LOG.md','DEC-1 APPROVED');await P.write(root,P.BASE+'/knowledge/ARCHITECTURE.md','notes');return old;};
  const a=await repo(),b=await repo();await seed(a);const old=await seed(b);
  const before=await tree(b),blocked=ps(pkg,['-RepoPath',b]);
  assert.equal(blocked.code,2);assert.match(blocked.err,/allow updates/);assert.deepEqual(await tree(b),before);
  // The wizard loads config.json and shows '.' as an empty field, exactly as the installer does.
  const cfg=JSON.parse(old.files[P.CONFIG]);for(const k in cfg.sources)if(cfg.sources[k]==='.')cfg.sources[k]='';
  const js=await jsInstall(a,cfg,true),r=ps(pkg,['-RepoPath',b,'-AllowUpdates']);
  assert.equal(r.code,0,r.err+r.out);assert.match(r.out,/Kept \(edited or unowned/);
  assert.deepEqual(unbatch(await tree(b)),unbatch(await tree(a)));
  assert.deepEqual(js.retired.sort(),[V21.AGENT,'.github/prompts/akzo-pbi-new-concise.prompt.md','.github/prompts/akzo-pbi-refine-concise.prompt.md'].sort());const t=await tree(b);
  assert.equal(t['playbook/pbis/existing/DECISION-LOG.md'],'DEC-1 APPROVED');assert.equal(t[P.BASE+'/knowledge/ARCHITECTURE.md'],'notes');assert.match(t[V21.CONCISE_AGENT],/Team note/);assert.equal(t[V21.AGENT],undefined);
 });
 await test('PowerShell upgrade from 3.0.0 matches the wizard and leaves PBI state, decisions, approvals and baselines untouched',async()=>{
  const raw={projectName:'Upgrade ಕ',ide:'vscode',role:'cdms',sources:{dab:'../DAB',legacy:'',cdms:''},includeReferences:false};
  const a30={...assets,template:await fs.readFile(path.join(__dirname,'fixtures/baseline-v3.0.0-template.md'),'utf8')},g=require('./fixtures/gap-cases.cjs');
  const folder='playbook/pbis/'+g.PBI,keep={[folder+'/pbi-state.json']:JSON.stringify(g.cases[0].state,null,2),[folder+'/REQUEST.md']:'# Request\n',[folder+'/REFINED-PBI.md']:g.cases[0].docs.refined,
   [folder+'/DECISION-LOG.md']:'DEC-1 approved',[P.BASE+'/knowledge/ARCHITECTURE.md']:'notes',[P.BASELINES['2.0-original'].path]:'edited baseline'};
  const seed=async d=>{const root=new DirectoryHandle(d),old=V30.setupFiles(raw,a30,'HTML 3.0');await V30.apply(root,await V30.plan(root,old.files,true));for(const [p,t] of Object.entries(keep))await P.write(root,p,t);return old;};
  const a=await repo(),b=await repo();await seed(a);const old=await seed(b);
  const cfg=JSON.parse(old.files[P.CONFIG]);for(const k in cfg.sources)if(cfg.sources[k]==='.')cfg.sources[k]='';
  await jsInstall(a,cfg,true);const r=ps(pkg,['-RepoPath',b,'-AllowUpdates']);assert.equal(r.code,0,r.err+r.out);
  // PBI-Builder.html differs by design (serialized page versus package file); everything else must be identical.
  const strip=t=>Object.fromEntries(Object.entries(unbatch(t)).filter(([k])=>!k.endsWith('PBI-Builder.html')&&k!==P.MANIFEST));
  assert.deepEqual(strip(await tree(b)),strip(await tree(a)));
  const t=await tree(b);for(const [p,x] of Object.entries(keep))assert.equal(t[p],x,p);
  const c=ps(pkg,['-RepoPath',b,'-Action','CheckPbi','-Pbi',g.PBI,'-Json']);assert.equal(c.code,3,c.err);
  assert.deepEqual(JSON.parse(c.out),await P.checkPbi(new DirectoryHandle(b),folder));assert.ok(JSON.parse(c.out).issues.some(i=>i.code==='APPROVAL_UNBOUND'));
 });
 await test('PowerShell preview, verify, conflict, repair, rollback, cmd wrapper and uninstall',async()=>{
  const d=await repo(),args=['-RepoPath',d,'-ProjectName','Repair test','-Ide','vscode','-Role','cdms'];
  let r=ps(pkg,[...args,'-Preview']);assert.equal(r.code,0,r.err);assert.match(r.out,/Preview only/);assert.deepEqual(Object.keys(await tree(d)),[]);
  assert.equal(ps(pkg,args).code,0);
  r=ps(pkg,['-RepoPath',d,'-Action','Verify']);assert.equal(r.code,0,r.err);assert.match(r.out,/All recorded files match/);
  const readme=path.join(d,'playbook/pbi-builder/README.md'),agent=path.join(d,'.github/agents/akzo-sdd-pbi-builder.agent.md'),good=await fs.readFile(agent,'utf8');
  await fs.rm(readme);await fs.writeFile(agent,good+'\nlocal edit');
  r=ps(pkg,['-RepoPath',d,'-Action','Verify']);assert.equal(r.code,3);assert.match(r.out,/MISSING\s+playbook\/pbi-builder\/README.md/);assert.match(r.out,/CHANGED\s+\.github\/agents/);
  r=ps(pkg,['-RepoPath',d,'-Action','Repair']);assert.equal(r.code,2);assert.match(r.err,/Nothing was written/);await assert.rejects(fs.stat(readme));
  await fs.writeFile(agent,good);r=ps(pkg,['-RepoPath',d,'-Action','Repair']);assert.equal(r.code,0,r.err);await fs.stat(readme);
  const cmd=cp.spawnSync('cmd.exe',['/d','/s','/c',`""${path.join(pkg,'Install-PBIBuilder.cmd')}" -RepoPath "${d}" -Action Verify"`],{encoding:'utf8',env,windowsVerbatimArguments:true});
  assert.equal(cmd.status,0,cmd.stdout+cmd.stderr);assert.match(cmd.stdout,/All recorded files match/);assert.doesNotMatch(cmd.stdout,/execution policy/);
  // An enforced policy that blocks the unsigned script is reported, not bypassed.
  const blockedCmd=cp.spawnSync('cmd.exe',['/d','/s','/c',`""${path.join(pkg,'Install-PBIBuilder.cmd')}" -RepoPath "${d}" -Action Verify"`],{encoding:'utf8',env:{...env,PSExecutionPolicyPreference:'AllSigned'},windowsVerbatimArguments:true});
  assert.equal(blockedCmd.status,11,blockedCmd.stdout+blockedCmd.stderr);assert.match(blockedCmd.stdout,/AllSigned[\s\S]*will not bypass[\s\S]*Akzo-SDD-PBI-Builder\.html[\s\S]*organization-signed package/);
  // A folder where a new file must go makes the write fail; every created file is removed again.
  const f=await repo();await fs.mkdir(path.join(f,'.github/prompts/akzo-pbi-refine.prompt.md'),{recursive:true});
  r=ps(pkg,['-RepoPath',f,'-ProjectName','Rollback','-Ide','vscode','-Role','dab']);assert.equal(r.code,2);assert.match(r.err,/write failed[\s\S]*restored/);assert.deepEqual(Object.keys(await tree(f)),[]);
  // Uninstall keeps PBIs, knowledge, backups and edited files; removes unchanged managed files and comparison agents.
  const root=new DirectoryHandle(d),cfg=P.normalizeConfig(JSON.parse(await fs.readFile(path.join(d,P.CONFIG),'utf8')));
  await P.write(root,'playbook/pbis/pbi-1/DECISION-LOG.md','DEC-1 APPROVED');await P.write(root,P.KNOWLEDGE,'{"schemaVersion":1,"entries":[]}');
  await P.write(root,P.BASELINES['2.1-concise'].path,P.baselineAgent(cfg,'2.1-concise'));await P.write(root,P.BASELINES['2.0-original'].path,'edited baseline');
  await fs.appendFile(path.join(d,'playbook/pbi-builder/sources.yaml'),'# my note\n');
  const pre=await tree(d);r=ps(pkg,['-RepoPath',d,'-Preview'],'Uninstall-PBIBuilder.ps1');assert.equal(r.code,0,r.err);assert.match(r.out,/Preview only/);assert.deepEqual(await tree(d),pre);
  r=ps(pkg,['-RepoPath',d],'Uninstall-PBIBuilder.ps1');assert.equal(r.code,0,r.err+r.out);
  const after=Object.keys(await tree(d)).filter(p=>!p.startsWith(P.BASE+'/backups/')).sort();
  assert.deepEqual(after,[P.BASELINES['2.0-original'].path,P.KNOWLEDGE,P.BASE+'/sources.yaml','playbook/pbis/pbi-1/DECISION-LOG.md'].sort());
  assert.ok(Object.keys(await tree(d)).some(p=>p.endsWith('/'+P.AGENT)&&p.includes('/backups/uninstall-')));
 });
 await test('PowerShell installer refuses a repository-relative junction without writing outside the repository',async()=>{
  const d=await repo(),outside=await repo(),junction=path.join(d,'playbook/pbi-builder');
  await fs.mkdir(path.dirname(junction),{recursive:true});await fs.writeFile(path.join(outside,'keep.txt'),'outside data');
  await fs.symlink(outside,junction,'junction');const before=await tree(outside);
  const r=ps(pkg,['-RepoPath',d,'-ProjectName','Junction test','-Ide','vscode','-Role','dab']);
  assert.equal(r.code,2,r.err+r.out);assert.match(r.err+r.out,/junction or reparse point/);assert.deepEqual(await tree(outside),before);
 });
 await test('readiness: PowerShell -Action CheckPbi reports exactly what core reports, for every shared case',async()=>{
  const d=await repo(),root=new DirectoryHandle(d),folder='playbook/pbis/'+CASE_PBI;
  const {cases}=await shared.load(P);
  // The 3.0.0-format gap states run through the same comparison.
  for(const c of [...cases,...require('./fixtures/gap-cases.cjs').cases]){
   for(const x of ['playbook','src','deploy'])await fs.rm(path.join(d,x),{recursive:true,force:true});
   await shared.writeCase(P,root,folder,c);
   const r=ps(pkg,['-RepoPath',d,'-Action','CheckPbi','-Pbi',CASE_PBI,'-Json']);
   assert.ok(r.code===0||r.code===3,c.name+': '+r.err);
   const expected=await P.checkPbi(root,folder);
   if(c.expect)assert.equal(expected.computedStatus,c.expect,c.name);else assert.equal(expected.finalAllowed,false,c.name);
   assert.deepEqual(JSON.parse(r.out),expected,c.name);assert.equal(r.code,expected.finalAllowed?0:3,c.name);
  }
  // Human-readable output offers the approval basis once the PBI is ready for review.
  for(const x of ['playbook','src','deploy'])await fs.rm(path.join(d,x),{recursive:true,force:true});await shared.writeCase(P,root,folder,cases[0]);
  const h=ps(pkg,['-RepoPath',d,'-Action','CheckPbi','-Pbi',CASE_PBI]);assert.equal(h.code,0,h.err);assert.match(h.out,/Approval basis[\s\S]*poba \(fingerprint [0-9a-f]{16}\): \{"/);
 });
 await test('evidence refresh: PowerShell and core record the same fingerprints and stale flags',async()=>{
  const index={schemaVersion:1,entries:[{id:'K-1',path:'src/Plugin ಕ.cs',fact:'Validates status',revision:'abc'},{id:'K-2',path:'src/gone.cs'},{id:'K-3',path:'../DAB/x.cs'},{id:'K-4',path:'src/bom.xml',sha256:'0'.repeat(64)},'not an entry']};
  const seed=async d=>{await fs.mkdir(path.join(d,'src'),{recursive:true});await fs.writeFile(path.join(d,'src/Plugin ಕ.cs'),'class A {}\r\n');await fs.writeFile(path.join(d,'src/bom.xml'),Buffer.from([0xef,0xbb,0xbf,0x3c,0x61,0x2f,0x3e]));const root=new DirectoryHandle(d);await P.write(root,P.KNOWLEDGE,JSON.stringify(index,null,2));return root;};
  const a=await repo(),b=await repo(),ra=await seed(a);await seed(b);
  const run=async()=>{const js=await P.refreshEvidence(ra),r=ps(pkg,['-RepoPath',b,'-Action','RefreshEvidence','-Json']);assert.ok(r.code===0||r.code===3,r.err);assert.deepEqual(JSON.parse(r.out),js);assert.deepEqual(await loose(path.join(b,P.KNOWLEDGE)),await loose(path.join(a,P.KNOWLEDGE)));return js;};
  let js=await run();assert.deepEqual(js.fingerprinted,['K-1']);assert.deepEqual(js.stale,['K-2','K-4']);assert.deepEqual(js.skipped,['K-3']);
  for(const d of [a,b])await fs.writeFile(path.join(d,'src/Plugin ಕ.cs'),'class A { int uncommitted; }\r\n');
  js=await run();assert.deepEqual(js.stale,['K-1','K-2','K-4']);
  js=await run();assert.equal(js.written,false);
 });
 await test('evidence dependencies: PowerShell and core mark the same findings stale when a dependsOn file changes',async()=>{
  const index={schemaVersion:1,entries:[{id:'K-A',path:'src/a.cs',dependsOn:['src/contract.cs','src/spaced dep.cs','../outside.cs','src/contract.cs',7]},{id:'K-B',path:'src/b.cs',dependsOn:['src/gone.cs']},{id:'K-C',path:'src/c.cs'}]};
  const seed=async d=>{await fs.mkdir(path.join(d,'src'),{recursive:true});for(const [n,t] of [['a.cs','class A {}'],['contract.cs','interface C {}'],['spaced dep.cs','x'],['b.cs','class B {}'],['c.cs','class C {}']])await fs.writeFile(path.join(d,'src',n),t);const root=new DirectoryHandle(d);await P.write(root,P.KNOWLEDGE,JSON.stringify(index,null,2));return root;};
  const a=await repo(),b=await repo(),ra=await seed(a);await seed(b);
  const run=async()=>{const js=await P.refreshEvidence(ra),r=ps(pkg,['-RepoPath',b,'-Action','RefreshEvidence','-Json']);assert.ok(r.code===0||r.code===3,r.err);assert.deepEqual(JSON.parse(r.out),js);assert.deepEqual(await loose(path.join(b,P.KNOWLEDGE)),await loose(path.join(a,P.KNOWLEDGE)));return js;};
  let js=await run();assert.deepEqual(js.reusable,['K-C']);assert.deepEqual(js.stale,['K-A','K-B']);
  assert.equal(JSON.parse(await fs.readFile(path.join(a,P.KNOWLEDGE),'utf8')).entries[0].staleReason,'invalid-dependency');
  js=await run();assert.equal(js.written,false);
  // The agent removes invalid dependencies only after reviewing the finding; missing files still block reuse.
  for(const d of [a,b]){const f=path.join(d,P.KNOWLEDGE),ix=JSON.parse(await fs.readFile(f,'utf8'));ix.entries[0].dependsOn=['src/contract.cs','src/spaced dep.cs'];delete ix.entries[0].stale;delete ix.entries[0].staleReason;await fs.writeFile(f,JSON.stringify(ix,null,2));}
  for(const d of [a,b])await fs.writeFile(path.join(d,'src/contract.cs'),'interface C { int Added(); }');
  js=await run();assert.deepEqual(js.stale,['K-A','K-B']);assert.deepEqual(js.reusable,['K-C']);
  const saved=JSON.parse(await fs.readFile(path.join(a,P.KNOWLEDGE),'utf8')).entries[0];assert.equal(saved.staleReason,'dependency-changed');assert.deepEqual(Object.keys(saved.dependencyHashes),['src/contract.cs','src/spaced dep.cs']);
  // A dependency that disappears also invalidates the finding (the agent first re-verified it and cleared the flag).
  for(const d of [a,b]){const f=path.join(d,P.KNOWLEDGE),ix=JSON.parse(await fs.readFile(f,'utf8'));delete ix.entries[0].stale;delete ix.entries[0].staleReason;await fs.writeFile(f,JSON.stringify(ix,null,2));await fs.rm(path.join(d,'src/spaced dep.cs'));}
  js=await run();assert.deepEqual(js.stale,['K-A','K-B']);
  assert.equal(JSON.parse(await fs.readFile(path.join(a,P.KNOWLEDGE),'utf8')).entries[0].staleReason,'dependency-changed');
 });
 await test('unsupported bundle schema, unknown tokens and unresolved placeholders fail clearly without writing',async()=>{
  const bad=async(name,mutate)=>{const dir=path.join(tmp,name);await fs.mkdir(dir);for(const f of ['Install-PBIBuilder.ps1','Akzo-SDD-PBI-Builder.html'])await fs.copyFile(path.join(pkg,f),path.join(dir,f));const b=P.bundle(assets);mutate(b);await fs.writeFile(path.join(dir,'pbi-builder-bundle.json'),JSON.stringify(b));return dir;};
  const d=await repo(),args=['-RepoPath',d,'-ProjectName','X','-Ide','vscode','-Role','dab'];
  let r=ps(await bad('schema2',b=>{b.schemaVersion=2;}),args);assert.equal(r.code,2);assert.match(r.err,/Unsupported bundle schemaVersion '2'/);
  r=ps(await bad('token',b=>{b.tokens.push('NEW_TOKEN');}),args);assert.equal(r.code,2);assert.match(r.err,/placeholder NEW_TOKEN/);
  r=ps(await bad('placeholder',b=>{b.setup.at(-1).template+='{{PBI:NOPE}}';}),args);assert.equal(r.code,2);assert.match(r.err,/Unresolved placeholder \{\{PBI:NOPE\}\} in \.github\/prompts\/akzo-pbi-refine\.prompt\.md/);
  assert.deepEqual(Object.keys(await tree(d)),[]);
 });
 await test('setup window engine (-NoGui): install remembers the repository, status, upgrade all outdated repositories, edited files block only their repository, uninstall forgets it',async()=>{
  const home=path.join(tmp,'home ಕ');await fs.mkdir(home);const reg=path.join(home,'.akzo-pbi-builder','repositories.txt');
  const setup=args=>ps(pkg,['-NoGui','-HomeRoot',home,...args],'PBI-Builder-Setup.ps1');
  const version=async d=>(await loose(path.join(d,P.MANIFEST))).packageVersion;
  const a=await repo();let r=setup(['-Action','Install','-Repo',a,'-Ide','vscode','-Role','dab']);assert.equal(r.code,0,r.out+r.err);
  assert.equal(await version(a),P.VERSION);assert.equal((await loose(path.join(a,P.CONFIG))).role,'dab');assert.equal((await loose(path.join(a,P.CONFIG))).includeReferences,false,'historical reports are opt-in');await assert.rejects(fs.access(path.join(a,P.BASE,'references')));assert.deepEqual((await fs.readFile(reg,'utf8')).trim().split(/\r?\n/),[a]);
  r=setup(['-Action','Install','-Repo',a]);assert.equal(r.code,0);assert.match(r.out,/Already up to date/);
  // Two 3.0.0 installations; one has an edited agent. Upgrade all upgrades the clean one, keeps its settings and reports the other.
  const a30={...assets,template:await fs.readFile(path.join(__dirname,'fixtures/baseline-v3.0.0-template.md'),'utf8')};
  const old=async(role)=>{const d=await repo(),root=new DirectoryHandle(d),cfg={projectName:'Old '+role,ide:'visualstudio',role,includeReferences:false,sources:{legacy:'',dab:'',cdms:''}};
   const f=V30.setupFiles(cfg,a30,'HTML 3.0');await V30.apply(root,await V30.plan(root,f.files,true));return d;};
  const b=await old('cdms'),c=await old('legacy');await fs.appendFile(path.join(c,P.AGENT),'\nlocal edit');
  await fs.appendFile(reg,b+'\r\n'+c+'\r\n');
  r=setup(['-Action','Status']);assert.match(r.out,new RegExp('up to date[\\s\\S]*update to '+P.VERSION.replace(/\./g,'\\.')+' available'));
  r=setup(['-Action','Upgrade']);assert.equal(r.code,3,'one repository was not upgraded');
  assert.equal(await version(b),P.VERSION);assert.equal((await loose(path.join(b,P.CONFIG))).role,'cdms');assert.ok((await fs.readdir(path.join(b,P.BASE,'backups'))).length);
  assert.equal(await version(c),'3.0.0');assert.match(r.out,/Nothing was written: files you edited differ/);assert.match(await fs.readFile(path.join(c,P.AGENT),'utf8'),/local edit/);
  r=setup(['-Action','Verify','-Repo',b]);assert.equal(r.code,0,r.out);assert.match(r.out,/All recorded files match/);
  r=setup(['-Action','Uninstall','-Repo',a]);assert.equal(r.code,0,r.out);await assert.rejects(fs.stat(path.join(a,P.MANIFEST)));assert.doesNotMatch(await fs.readFile(reg,'utf8'),new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  // Double-click path: the .cmd opens the window (it stays open until closed); with arguments it still runs the engine.
  const src=await fs.readFile(path.join(pkg,'Install-PBIBuilder.cmd'),'utf8');assert.match(src,/PBI-Builder-Setup\.ps1/);assert.doesNotMatch(src+await fs.readFile(path.join(pkg,'PBI-Builder-Setup.ps1'),'utf8'),/\s-ExecutionPolicy\s|PSExecutionPolicyPreference|EncodedCommand|Invoke-Expression|iex /i);
 });
 await test('launchers: Install.cmd and Uninstall.cmd, package check, downloaded-file mark, blocked policy, interrupted install, log and exit codes',async()=>{
  const d=await repo(),A=`-RepoPath "${d}"`;
  let r=cmdRun(pkg,'Install.cmd',`${A} -ProjectName L -Ide vscode -Role dab`);assert.equal(r.code,0,r.out);
  r=cmdRun(pkg,'Install.cmd',`${A} -Action Verify`);assert.equal(r.code,0,r.out);assert.match(r.out,/All recorded files match/);
  // Reinstall: nothing to write. Repeated uninstall and install leave a working installation.
  r=cmdRun(pkg,'Install.cmd',A);assert.equal(r.code,0,r.out);assert.doesNotMatch(r.out,/create|update/);
  r=cmdRun(pkg,'Uninstall.cmd',`${A} -Preview`);assert.equal(r.code,0,r.out);assert.match(r.out,/Preview only/);
  for(let i=0;i<2;i++){r=cmdRun(pkg,'Uninstall.cmd',A);assert.equal(r.code,0,r.out);await assert.rejects(fs.stat(path.join(d,P.MANIFEST)));r=cmdRun(pkg,'Install.cmd',`${A} -ProjectName L -Ide vscode -Role dab`);assert.equal(r.code,0,r.out);}
  r=cmdRun(pkg,'Uninstall.cmd',A);assert.equal(r.code,0,r.out);r=cmdRun(pkg,'Uninstall.cmd',A);assert.equal(r.code,2);assert.match(r.out,/Nothing to uninstall/);
  // Interrupted install (process killed before the record was written): rerunning completes it.
  const full=await repo();assert.equal(cmdRun(pkg,'Install.cmd',`-RepoPath "${full}" -ProjectName L -Ide vscode -Role dab`).code,0);
  const t=await tree(full),half=await repo();for(const [p,x] of Object.entries(t).slice(0,4))if(p!==P.MANIFEST){await fs.mkdir(path.dirname(path.join(half,p)),{recursive:true});await fs.writeFile(path.join(half,p),x);}
  r=cmdRun(pkg,'Install.cmd',`-RepoPath "${half}" -ProjectName L -Ide vscode -Role dab`);assert.equal(r.code,0,r.out);assert.deepEqual(await tree(half),t);
  // Downloaded-file mark under RemoteSigned: explained, removed only after Y, never otherwise.
  const ps1=path.join(pkg,'Install-PBIBuilder.ps1'),mark=ps1+':Zone.Identifier',RS={PSExecutionPolicyPreference:'RemoteSigned'};
  await fs.writeFile(mark,'[ZoneTransfer]\r\nZoneId=3\r\n');
  r=cmdRun(pkg,'Install-PBIBuilder.cmd',`${A} -Action Verify`,RS,'N\r\n');assert.equal(r.code,12,r.out);assert.match(r.out,/RemoteSigned[\s\S]*downloaded[\s\S]*Nothing was changed/);await fs.stat(mark);
  r=cmdRun(pkg,'Install-PBIBuilder.cmd',`-RepoPath "${full}" -Action Verify`,RS,'Y\r\n');assert.equal(r.code,0,r.out);assert.match(r.out,/All recorded files match/);await assert.rejects(fs.stat(mark));
  // Restricted: no bypass; the compliant options are listed.
  r=cmdRun(pkg,'Install.cmd',`-RepoPath "${full}" -Action Verify`,{PSExecutionPolicyPreference:'Restricted'});assert.equal(r.code,11,r.out);assert.match(r.out,/Restricted[\s\S]*will not bypass/);
  // A damaged or missing package file stops before PowerShell runs anything.
  const sums=path.join(pkg,'SHA256SUMS.txt'),crypto=require('node:crypto');
  const lines=[];for(const f of ['Install-PBIBuilder.ps1','PBI-Builder-Setup.ps1','Install-PBIBuilder.cmd'])lines.push(crypto.createHash('sha256').update(await fs.readFile(path.join(pkg,f))).digest('hex')+'  '+f);
  await fs.writeFile(sums,lines.join('\n')+'\n');assert.equal(cmdRun(pkg,'Install.cmd',`-RepoPath "${full}" -Action Verify`).code,0);
  await fs.writeFile(sums,'0'.repeat(64)+'  Install-PBIBuilder.ps1\n');r=cmdRun(pkg,'Install.cmd',`-RepoPath "${full}" -Action Verify`);assert.equal(r.code,10,r.out);assert.match(r.out,/missing or changed: Install-PBIBuilder\.ps1/);await fs.rm(sums);
  await fs.rename(path.join(pkg,'pbi-builder-bundle.json'),path.join(pkg,'x.json'));r=cmdRun(pkg,'Uninstall.cmd',`-RepoPath "${full}"`);assert.equal(r.code,10,r.out);assert.match(r.out,/Missing package file: pbi-builder-bundle\.json/);await fs.stat(path.join(full,P.MANIFEST));
  await fs.rename(path.join(pkg,'x.json'),path.join(pkg,'pbi-builder-bundle.json'));
  // Every run leaves one JSON line in the log.
  const log=(await fs.readFile(path.join(tmp,'.akzo-pbi-builder','logs','install.log'),'utf8')).trim().split('\n').map(l=>JSON.parse(l.replace(/^\uFEFF/,'')));
  for(const c of [0,2,10,11,12])assert.ok(log.some(l=>l.exitCode===c),'log has exit code '+c);assert.ok(log.some(l=>l.step==='preflight'&&l.policy==='Restricted'));
 });
 await test('HTML and PowerShell uninstall leave identical repositories (same kept files, same backups)',async()=>{
  const cfg={projectName:'Parity',ide:'vscode',role:'dab',includeReferences:false,sources:{legacy:'',dab:'',cdms:''}},a=await repo(),b=await repo();
  for(const d of [a,b]){await jsInstall(d,cfg);const root=new DirectoryHandle(d);await P.write(root,'playbook/pbis/pbi-9/REQUEST.md','keep me');await fs.appendFile(path.join(d,P.BASE,'sources.yaml'),'# mine\n');}
  const root=new DirectoryHandle(a);await P.uninstall(root,await P.uninstallPlan(root,P.normalizeConfig(cfg)));
  const r=ps(pkg,['-RepoPath',b],'Uninstall-PBIBuilder.ps1');assert.equal(r.code,0,r.err+r.out);
  const norm=t=>Object.fromEntries(Object.entries(t).map(([k,v])=>[k.replace(/backups\/uninstall-[^/]+\//,'backups/uninstall-*/'),v]));
  assert.deepEqual(norm(await tree(b)),norm(await tree(a)));
 });
 await test('other reference repositories: PowerShell -OtherSource writes what the form writes, Repair keeps them, ";" clears them, invalid names refused',async()=>{
  const cfg={projectName:'Refs',ide:'vscode',role:'dab',includeReferences:false,sources:{legacy:'../Legacy',dab:'',cdms:'../CDMS ಕ'},others:[{name:'Portal',path:'../Portal'},{name:'Reports "R"',path:'..\\Rep orts'}]};
  const a=await repo(),b=await repo();await jsInstall(a,cfg);
  let r=ps(pkg,['-RepoPath',b,'-ProjectName','Refs','-Ide','vscode','-Role','dab','-LegacySource','../Legacy','-CdmsSource','../CDMS ಕ','-NoReferences','-OtherSource','Portal=../Portal;Reports "R"=..\\Rep orts']);
  if(r.code!==0||!(await tree(b))[P.CONFIG]?.includes('Reports \\"R\\"')){// Quotes in a command-line argument are unreliable in PowerShell 5.1 (see the first test): retry from config.json.
   await fs.rm(b,{recursive:true,force:true});await fs.mkdir(path.join(b,'.git'),{recursive:true});await fs.mkdir(path.join(b,P.BASE),{recursive:true});await fs.copyFile(path.join(a,P.CONFIG),path.join(b,P.CONFIG));r=ps(pkg,['-RepoPath',b]);}
  assert.equal(r.code,0,r.err+r.out);assert.deepEqual(await tree(b),await tree(a));
  await fs.rm(path.join(b,P.BASE,'sources.yaml'));r=ps(pkg,['-RepoPath',b,'-Action','Repair']);assert.equal(r.code,0,r.err);assert.deepEqual(await tree(b),await tree(a));
  r=ps(pkg,['-RepoPath',b,'-OtherSource',';','-AllowUpdates']);assert.equal(r.code,0,r.err+r.out);
  assert.deepEqual(JSON.parse((await tree(b))[P.CONFIG]).others,[]);assert.match((await tree(b))[P.BASE+'/sources.yaml'],/otherRepositories: \[\]/);
  for(const bad of ['DAB=../x','A=x;a=y','NoEquals','UI=../x'])assert.equal(ps(pkg,['-RepoPath',b,'-OtherSource',bad,'-Preview']).code,2,bad);
 });
 await test('5.0 shared Angular UI repository: -UiSource and -Role ui write what the form writes; a 4.x config.json gains an empty ui source',async()=>{
  for(const [cfg,args] of [[{projectName:'UiRef',ide:'visualstudio',role:'cdms',includeReferences:false,sources:{legacy:'../Legacy',dab:'',cdms:'',ui:'..\\AN.ColorAppsAzure.UI'}},['-Role','cdms','-LegacySource','../Legacy','-UiSource','..\\AN.ColorAppsAzure.UI']],
   [{projectName:'UiRef',ide:'visualstudio',role:'ui',includeReferences:false,sources:{legacy:'../Legacy',dab:'../DAB',cdms:'../CDMS'}},['-Role','ui','-LegacySource','../Legacy','-DabSource','../DAB','-CdmsSource','../CDMS']]]){
   const a=await repo(),b=await repo();await jsInstall(a,cfg);
   const r=ps(pkg,['-RepoPath',b,'-ProjectName','UiRef','-Ide','visualstudio','-NoReferences',...args]);assert.equal(r.code,0,r.err+r.out);assert.deepEqual(await tree(b),await tree(a));}
  // An installed 4.x config.json (no ui key) upgrades to the same files in both installers.
  const old={schemaVersion:1,packageVersion:'4.2.0',projectName:'Old',ide:'visualstudio',role:'legacy',agentName:'Akzo SDD PBI Builder - Old',includeReferences:false,sources:{legacy:'.',dab:'../DAB',cdms:''},others:[]};
  const a=await repo(),b=await repo();await jsInstall(a,old);
  const oldText=JSON.stringify(old,null,2)+'\n';await fs.mkdir(path.join(b,P.BASE),{recursive:true});await fs.writeFile(path.join(b,P.CONFIG),oldText);
  await fs.writeFile(path.join(b,P.MANIFEST),JSON.stringify({schemaVersion:1,packageVersion:'4.2.0',files:{[P.CONFIG]:await P.hash(oldText)}},null,2));
  const r=ps(pkg,['-RepoPath',b,'-AllowUpdates']);assert.equal(r.code,0,r.err+r.out);
  const ta=await tree(a),tb=await tree(b);assert.equal(tb[P.CONFIG],ta[P.CONFIG]);assert.equal(tb[P.BASE+'/sources.yaml'],ta[P.BASE+'/sources.yaml']);assert.equal(JSON.parse(tb[P.CONFIG]).sources.ui,'');
 });
 await test('repository paths persist across install, reinstall, upgrade, repair and restart; configured is kept apart from verified read access',async()=>{
  // A multi-root layout: the selected repository, siblings with spaces and non-ASCII names, one empty, one missing, one absolute.
  const base=path.join(tmp,'multi root ಕ'),main=path.join(base,'Main Repo'),leg=path.join(base,'Legacy Repo'),ui=path.join(base,'UI Repo'),dab=path.join(base,'DAB Repo');
  for(const [d,f,t] of [[main,'src/Handler.cs','class Handler {}'],[leg,'Plugins/Plugin ಕ.cs','class P {}'],[ui,'src/app/app.module.ts','export class M {}'],[ui,'node_modules/x/index.js','x'],[dab,'README.txt','no source here']]){await fs.mkdir(path.dirname(path.join(d,f)),{recursive:true});await fs.writeFile(path.join(d,f),t);}
  await fs.mkdir(path.join(main,'.git'),{recursive:true});
  const uiAbs=ui.replace(/\\/g,'/'),base1=['-RepoPath',main,'-ProjectName','Multi Root','-Ide','vscode','-Role','cdms'];
  const cfg=()=>loose(path.join(main,P.CONFIG)),yaml=()=>fs.readFile(path.join(main,P.BASE,'sources.yaml'),'utf8');
  // Fresh install: values are saved to the canonical config, synchronized to sources.yaml and byte-identical to the form's output.
  let r=ps(pkg,[...base1,'-LegacySource','../Legacy Repo','-UiSource',uiAbs,'-DabSource','../DAB Repo','-OtherSource','Portal=../Portal Missing']);assert.equal(r.code,0,r.err+r.out);
  let c=await cfg();assert.deepEqual(c.sources,{legacy:'../Legacy Repo',dab:'../DAB Repo',cdms:'.',ui:uiAbs});assert.deepEqual(c.others,[{name:'Portal',path:'../Portal Missing'}]);
  const js=await repo();await jsInstall(js,{projectName:'Multi Root',ide:'vscode',role:'cdms',includeReferences:false,sources:{legacy:'../Legacy Repo',dab:'../DAB Repo',cdms:'',ui:uiAbs},others:[{name:'Portal',path:'../Portal Missing'}]});
  assert.equal(await fs.readFile(path.join(js,P.CONFIG),'utf8'),await fs.readFile(path.join(main,P.CONFIG),'utf8'));assert.equal(await fs.readFile(path.join(js,P.BASE,'sources.yaml'),'utf8'),await yaml());
  assert.ok((await yaml()).includes('../Legacy Repo')&&(await yaml()).includes(uiAbs));
  // Configured is not verified: the install report says what was actually read.
  const row=(out,key)=>new RegExp('^  '+key.replace(/[:]/g,'\\$&')+'\\s+(\\S+)\\s+(.*)$','m').exec(out);
  assert.match(r.out,/Source access \(configured paths, then what was actually read/);
  assert.deepEqual([['legacy','readable'],['cdms','readable'],['ui','readable'],['dab','configured-inaccessible'],['other:Portal','configured-inaccessible']].map(([k])=>row(r.out,k)?.[1]),['readable','readable','readable','configured-inaccessible','configured-inaccessible']);
  assert.match(row(r.out,'dab')[2],/No readable source file found under .*DAB Repo/);assert.match(row(r.out,'other:Portal')[2],/Folder not found: .*Portal Missing/);assert.match(row(r.out,'legacy')[2],/Read Plugins\/Plugin ಕ\.cs under .*Legacy Repo/);
  assert.ok(!/node_modules/.test(row(r.out,'ui')[2]),'dependency folders are not searched');assert.match(row(r.out,'cdms')[2],/Read src\/Handler\.cs/);
  // Reinstall with only the editor changed keeps every saved path; the agent is regenerated with them.
  r=ps(pkg,['-RepoPath',main,'-Ide','visualstudio','-AllowUpdates']);assert.equal(r.code,0,r.err+r.out);c=await cfg();assert.equal(c.ide,'visualstudio');assert.deepEqual(c.sources,{legacy:'../Legacy Repo',dab:'../DAB Repo',cdms:'.',ui:uiAbs});assert.equal(c.others.length,1);
  assert.ok((await fs.readFile(path.join(main,P.AGENT),'utf8')).includes('tools: ["readfile"'),'agent regenerated for the new editor');
  // An empty value never replaces a saved path.
  r=ps(pkg,['-RepoPath',main,'-LegacySource','','-AllowUpdates']);assert.equal(r.code,0,r.err+r.out);assert.match(r.out+r.err,/-LegacySource was empty, so the saved legacy path was kept/);assert.equal((await cfg()).sources.legacy,'../Legacy Repo');
  // Clearing is explicit, and a change of role says what happened to the old role's path.
  r=ps(pkg,['-RepoPath',main,'-ClearSource','ui','-AllowUpdates']);assert.equal(r.code,0,r.err+r.out);assert.equal((await cfg()).sources.ui,'');assert.equal((await cfg()).sources.legacy,'../Legacy Repo');
  r=ps(pkg,['-RepoPath',main,'-UiSource',uiAbs,'-Role','legacy','-AllowUpdates']);assert.equal(r.code,0,r.err+r.out);assert.match(r.out+r.err,/role of this repository changed from cdms to legacy/);c=await cfg();assert.equal(c.sources.legacy,'.');assert.equal(c.sources.cdms,'');assert.equal(c.sources.ui,uiAbs);
  r=ps(pkg,['-RepoPath',main,'-Role','cdms','-LegacySource','../Legacy Repo','-AllowUpdates']);assert.equal(r.code,0,r.err+r.out);c=await cfg();assert.deepEqual(c.sources,{legacy:'../Legacy Repo',dab:'../DAB Repo',cdms:'.',ui:uiAbs});
  // Invalid path characters are refused by both installers with the same message, and nothing is written.
  const before=await tree(main);r=ps(pkg,['-RepoPath',main,'-DabSource','bad|path','-AllowUpdates']);assert.equal(r.code,2);assert.match(r.err,/Source paths cannot contain < > " \| \? \* \(not valid in Windows paths\)\./);assert.deepEqual(await tree(main),before);
  assert.throws(()=>P.normalizeConfig({projectName:'X',role:'dab',sources:{legacy:'a<b'}}),/Source paths cannot contain < > " \| \? \* \(not valid in Windows paths\)\./);
  assert.throws(()=>P.normalizeConfig({projectName:'X',role:'dab',sources:{},others:[{name:'O',path:'x?y'}]}),/cannot contain/);
  // Repair restores a deleted managed file from the saved config and ignores setting parameters; paths survive a repair.
  await fs.rm(path.join(main,P.AGENT));r=ps(pkg,['-RepoPath',main,'-Action','Repair','-LegacySource','../Elsewhere']);assert.equal(r.code,0,r.err+r.out);assert.match(r.out+r.err,/Repair uses the installed config\.json/);
  assert.equal((await cfg()).sources.legacy,'../Legacy Repo');assert.ok((await fs.stat(path.join(main,P.AGENT))).isFile());assert.match(r.out,/Source access/);
  // Verify (a new process: a restart) reports configured-but-not-verified honestly when a folder disappears; the saved path stays.
  await fs.rename(ui,ui+' moved');r=ps(pkg,['-RepoPath',main,'-Action','Verify']);assert.equal(r.code,0,r.err+r.out);
  assert.equal(row(r.out,'ui')[1],'configured-inaccessible');assert.match(row(r.out,'ui')[2],/Folder not found/);assert.equal((await cfg()).sources.ui,uiAbs);assert.equal(row(r.out,'legacy')[1],'readable');
  // An existing multi-root workspace file marks a readable source outside it.
  await fs.rename(ui+' moved',ui);await fs.writeFile(path.join(main,'Multi.code-workspace'),'{\n  // approved folders\n  "folders": [ { "path": "." }, { "path": "../Legacy Repo" }, ],\n}\n');
  r=ps(pkg,['-RepoPath',main,'-Action','Verify']);assert.equal(r.code,0,r.err+r.out);assert.ok(!/outside the workspace file/.test(row(r.out,'legacy')[2]));assert.match(row(r.out,'ui')[2],/outside the workspace file: agent file tools may not reach it/);assert.equal(row(r.out,'ui')[1],'readable');
 });
 console.log(`\n${count} PowerShell installer checks passed (Windows PowerShell, real execution policy, real files).`);
 await fs.rm(tmp,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exitCode=1;});
