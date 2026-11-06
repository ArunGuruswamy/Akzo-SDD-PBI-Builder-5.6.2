'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const P=require('./src/core.js'),shared=require('./fixtures/readiness-cases.cjs');
const {DirectoryHandle,FileHandle}=require('./fixtures/fs-handles.cjs');
const assets=JSON.parse(require('node:fs').readFileSync(path.join(__dirname,'src/assets.json'),'utf8'));

async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-targeted-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=new DirectoryHandle(dir),folder='playbook/pbis/'+shared.PBI;
 await fs.mkdir(path.join(dir,'.git'));
 const {cases}=await shared.load(P),c=JSON.parse(JSON.stringify(cases.find(x=>x.name==='fully approved PBI may be finalized')));
 c.state.status='Ready for Review';c.state.approvals={user:{status:'pending'}};
 c.docs.draft=c.docs.refined.replace(/^Status:.*$/m,'Status: Ready for Review');c.docs.refined=null;
 await shared.writeCase(P,root,folder,c);
 await P.write(root,folder+'/pbi.json',JSON.stringify({number:'305974',title:'Measurement',description:'Original intake',acceptanceCriteria:'Original user criteria',wizard:{step:'source-access',status:'draft',note:'Keep original note'}}));
 return {dir,root,folder,c};
}
async function externalFixture(t){
 const f=await fixture(t),s=f.c.state;
 for(let i=1;i<=5;i++)if(!s.decisions.some(d=>d.id==='DEC-'+i))s.decisions.push({id:'DEC-'+i,pbi:s.pbi,status:'approved',decision:'Preserved decision '+i,evidence:'User supplied answer '+i});
 const gaps=['Color Measurement Service contract','Created By/Created On persistence','Instrument metadata resolution','DAB authorization policy and effective identity','Transaction and idempotency guarantees']
  .map((description,i)=>({id:'EXT-'+(i+1),classification:'EXTERNAL_DEPENDENCY',description,owner:i===3?'DAB security owner':'External dependency owner',readinessRefs:['BR-1']}));
 s.rules[0].gaps=gaps.map(g=>({id:g.id,description:g.description,status:'open',impact:'BLOCKING'}));
 s.analysis={gaps,requirementsComplete:true};
 await P.write(f.root,f.folder+'/pbi-state.json',JSON.stringify(s,null,2));
 return {...f,gaps};
}
async function packageFor(dir){
 const pkg=path.join(dir,'package');await fs.mkdir(pkg);
 await fs.copyFile(path.join(__dirname,'installer/Install-PBIBuilder.ps1'),path.join(pkg,'Install-PBIBuilder.ps1'));
 await fs.writeFile(path.join(pkg,'pbi-builder-bundle.json'),JSON.stringify(P.bundle(assets)));
 await fs.writeFile(path.join(pkg,'Akzo-SDD-PBI-Builder.html'),'<html></html>');
 return pkg;
}
function ps(pkg,dir,action,folder){
 const env={...process.env,USERPROFILE:dir};delete env.PSExecutionPolicyPreference;
 const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(pkg,'Install-PBIBuilder.ps1'),'-RepoPath',dir,'-Action',action,...(folder?['-Pbi',folder]:[]),'-Json'],{encoding:'utf8',env,timeout:120000});
 assert.ifError(r.error);assert.ok([0,3].includes(r.status),r.stdout+r.stderr);return JSON.parse(r.stdout.trim());
}

test('canonical mirrors repair drift, preserve intake, decisions and history, and are idempotent',async t=>{
 const {root,folder,c,dir}=await fixture(t),decisions=JSON.stringify(c.state.decisions),request=await P.read(root,folder+'/REQUEST.md');
 const intake=JSON.parse(await P.read(root,folder+'/pbi.json'));
 await P.write(root,folder+'/DRAFT-PBI.md','# Draft\nStatus: Development-Ready\n\n## Acceptance criteria\n\nWrong mirrored criterion\n\n## Reviewer notes\n\nKeep authored notes.\n');
 const sync=await P.synchronizePbi(root,folder);
 assert.ok(sync.changed.includes('DRAFT-PBI.md'));
 assert.equal(JSON.stringify(sync.state.decisions),decisions);
 assert.equal(await P.read(root,folder+'/REQUEST.md'),request);
 const saved=JSON.parse(await P.read(root,folder+'/pbi.json'));for(const key of ['description','acceptanceCriteria'])assert.deepEqual(saved[key],intake[key]);
 assert.equal(saved.wizard.note,intake.wizard.note);assert.notEqual(saved.wizard.status,'draft');assert.equal(saved.wizard.step,'review');
 const draft=await P.read(root,folder+'/DRAFT-PBI.md');assert.ok(draft.includes('Keep authored notes.'));assert.ok(!draft.includes('Wrong mirrored criterion'));
 for(const a of c.state.acceptanceCriteria)assert.ok(draft.includes(a.criterion.replace(/\r?\n/g,'<br>')));
 assert.equal(sync.report.issues.some(i=>/^DOC_/.test(i.code)),false);
 assert.ok((await fs.readdir(path.join(dir,folder,'history'))).length>0);
 const warm=await P.measure(()=>P.synchronizePbi(root,folder));assert.deepEqual(warm.result.changed,[]);assert.equal(warm.metrics.writes,0);
});

test('five external gaps automatically generate and resume a complete conditional PBI without changing decisions',async t=>{
 const {root,folder,c,gaps}=await externalFixture(t),approved=JSON.stringify(c.state.decisions);
 let run=await P.advanceWorkflow(root,folder);
 assert.equal(run.next.action,'REFINEMENT_COMPLETE',JSON.stringify(run.next));assert.equal(run.next.conditional,true);assert.equal(run.next.gaps.length,5);
 assert.equal(run.report.finalAllowed,false);assert.equal(JSON.stringify(run.state.decisions),approved);
 assert.equal(run.state.analysis.workflowChoices,undefined);
 assert.equal(run.next.finalAllowed,false);
 assert.equal(run.state.analysis.conditionalPlan.verificationTasks.length,5);
 assert.equal(run.state.analysis.conditionalPlan.technicalDependencies.length,5);
 assert.ok(run.state.analysis.conditionalPlan.acceptanceCriteria.length>0);
 assert.ok(run.state.analysis.conditionalPlan.testTasks.length>0);
 assert.ok(run.state.analysis.conditionalPlan.securityConsiderations.includes('security'));
 const conditionalDraft=await P.read(root,folder+'/DRAFT-PBI.md');
 assert.ok(conditionalDraft.includes('CONDITIONAL working draft only'));
 for(const section of ['Target paths','Conditional acceptance criteria','Implementation steps','Acceptance-criteria regression tests','Unresolved technical dependencies','Reused verified behavior','Implementation readiness snapshot'])
  assert.ok(conditionalDraft.includes('### '+section),section);
 assert.doesNotMatch(conditionalDraft,/\[object Object\]/);
 assert.equal(JSON.stringify(run.state.decisions),approved);
 for(const name of ['Refined-PBI-CDMS.md','Refined-PBI-DAB.md','Refined-PBI-UI.md','REFINED-PBI.md'])assert.equal(await P.read(root,folder+'/'+name),null);
 const generatedState=await P.read(root,folder+'/pbi-state.json'),generatedDraft=await P.read(root,folder+'/DRAFT-PBI.md');
 const resumed=await P.advanceWorkflow(root,folder);
 assert.equal(resumed.next.action,'REFINEMENT_COMPLETE');assert.equal(resumed.next.conditional,true);
 assert.deepEqual(resumed.state.analysis.conditionalPlan,run.state.analysis.conditionalPlan);
 assert.deepEqual(resumed.state.decisions,run.state.decisions);assert.equal(await P.read(root,folder+'/DRAFT-PBI.md'),generatedDraft);
 assert.ok(resumed.report.issues.some(i=>i.code==='EVIDENCE_GAP'));assert.equal(resumed.state.rules[0].gaps.length,5);
 assert.equal(resumed.state.approvals.user.status,'pending');
 assert.deepEqual(resumed.state.analysis.gaps,gaps);
 const priorFingerprint=resumed.state.analysis.workflow.inputFingerprint;
 await P.write(root,folder+'/DRAFT-PBI.md',(await P.read(root,folder+'/DRAFT-PBI.md'))+'\n## Reviewer note\n\nA new supplied observation.\n');
 const changed=await P.advanceWorkflow(root,folder);
 assert.notEqual(changed.state.analysis.workflow.inputFingerprint,priorFingerprint);
});

test('resume the explicit same-name nested PBI folder in place and upgrade its saved conditional plan',async t=>{
 const {dir,root,folder}=await externalFixture(t),nestedFolder=folder+'/'+shared.PBI;
 const temporary=path.join(dir,'nested-source'),nestedPath=path.join(dir,...nestedFolder.split('/'));
 await fs.cp(path.join(dir,...folder.split('/')),temporary,{recursive:true});
 await fs.mkdir(nestedPath,{recursive:true});await fs.cp(temporary,nestedPath,{recursive:true});await fs.rm(temporary,{recursive:true,force:true});
 const original=JSON.parse(await P.read(root,nestedFolder+'/pbi-state.json')),parentState=await P.read(root,folder+'/pbi-state.json'),run=await P.advanceWorkflow(root,nestedFolder);
 assert.equal(run.next.action,'REFINEMENT_COMPLETE');assert.equal(run.next.conditional,true);
 assert.deepEqual(run.state.decisions,original.decisions);
 assert.equal(run.state.analysis.conditionalPlan.acceptanceCriteria.length,original.acceptanceCriteria.length);
 assert.ok(run.state.analysis.conditionalPlan.testTasks.length>=original.acceptanceCriteria.length);
 assert.ok(run.state.analysis.conditionalPlan.technicalDependencies.length>0);
 assert.ok((await P.read(root,nestedFolder+'/DRAFT-PBI.md')).includes('CONDITIONAL working draft only'));
 assert.equal(await P.read(root,folder+'/pbi-state.json'),parentState,'the canonical parent copy is not modified');
});

test('recorded per-rule gaps and object-shaped source access prevent redundant source analysis',()=>{
 const state={pbi:'306618',sourceAccess:{dab:{status:'readable',path:'../DAB'},ui:{status:'readable',path:'../UI'}},
  paths:{dab:{applies:true},ui:{applies:true}},
  rules:[{id:'BR-1',rule:'Persist the approved measurement behavior.',branches:[{id:'BR-1.DEFAULT',dab:'unverified',ui:'unverified'}],
   gaps:[{id:'G-1',status:'open',impact:'BLOCKING',description:'DAB API and shared UI implementation work is already recorded.'}]}],
  analysis:{gaps:[{id:'EXT-1',classification:'TARGET_METADATA_UNVERIFIED',readinessRefs:['BR-1']}]}};
 assert.deepEqual(P.ruleVerificationWork(state),[]);
});

test('conditional generation requires defined business requirements but no consent or technical evidence',async t=>{
 const {root,folder,gaps}=await externalFixture(t);
 await assert.rejects(P.generateConditionalPbi(root,folder,{gaps,requirementsComplete:false}),/not authorized/);
 const generated=await P.generateConditionalPbi(root,folder,{gaps,requirementsComplete:true});
 assert.equal(generated.state.analysis.conditionalPbiGenerated,true);
 assert.equal(generated.state.approvals.user.status,'pending');
 assert.equal(generated.report.finalAllowed,false);
 assert.ok((await P.read(root,folder+'/DRAFT-PBI.md')).includes('Conditional implementation plan'));
});

test('persistent workflow detects unchanged automatic work, bounds history and applies custom/evidence responses once',()=>{
 const action={action:'AUTO_CONTINUE',stage:'IMPLEMENTATION_ANALYSIS',reason:'Investigate saved source',next:'Read the next relevant file'};
 let progress=P.recordWorkflowProgress({pbi:'305974'},action,'same');
 progress=P.recordWorkflowProgress(JSON.parse(JSON.stringify(progress.state)),action,'same');
 assert.equal(progress.next.action,'ASK_DECISION');assert.equal(progress.next.decision.allowCustom,true);
 for(let i=0;i<50;i++)progress=P.recordWorkflowProgress(progress.state,action,'new-'+i);
 assert.equal(progress.state.analysis.workflow.transitions.length,32);
 const gap={id:'EXT-1',description:'External service',classification:'EXTERNAL_DEPENDENCY'};
 let state=P.recordWorkflowChoice({pbi:'305974'},{option:'D',custom:'Ask the service owner'}).state;
 state=P.completeWorkflowChoice(state,'WF-1');
 const next=P.workflowNextAction({state,gaps:[gap],requirementsComplete:true,readiness:{computedStatus:'Needs Evidence',issues:[]}});
 assert.equal(next.action,'GENERATE_CONDITIONAL_PBI');assert.equal(next.gaps[0].description,'External service');
 state=P.recordWorkflowChoice({pbi:'305974'},{option:'B'}).state;state=P.completeWorkflowChoice(state,'WF-1');
 assert.equal(state.analysis.externalEvidenceRequested,true);
 assert.equal(P.workflowNextAction({state,gaps:[gap],requirementsComplete:true,readiness:{computedStatus:'Needs Evidence',issues:[]}}).action,'GENERATE_CONDITIONAL_PBI');
 const conditional=P.workflowNextAction({state:{analysis:{conditionalPbiGenerated:true}},gaps:[gap],requirementsComplete:true,implementationPlanComplete:true,
  readiness:{computedStatus:'Draft',issues:[{code:'MISSING_COVERAGE',ref:'BR-1/negative'}]}});
 assert.equal(conditional.action,'BLOCKED_EXTERNAL');assert.deepEqual(conditional.issues.map(i=>i.code),['MISSING_COVERAGE']);
 assert.throws(()=>P.workflowNextAction({maxAutoSteps:100}),/budget/);
});

test('evidence rejects missing or unsafe dependencies, dependency-set edits, recorded revisions and repository moves',async t=>{
 const {root}=await fixture(t);
 await P.write(root,'src/A.cs','class A {}');await P.write(root,'src/B.cs','class B {}');
 await P.write(root,'.git/HEAD','a'.repeat(40));
 const entries=[
  {id:'missing',path:'src/A.cs',dependsOn:['src/Missing.cs']},
  {id:'unsafe',path:'src/A.cs',dependsOn:['../External.cs']},
  {id:'set',path:'src/A.cs',dependsOn:['src/B.cs']},
  {id:'revision',path:'src/A.cs',revision:'main abc'},
  {id:'commit',path:'src/A.cs',repositoryCommit:'a'.repeat(40)}
 ];
 await P.write(root,P.KNOWLEDGE,JSON.stringify({schemaVersion:1,entries}));
 let r=await P.refreshEvidence(root);assert.deepEqual(r.stale,['missing','unsafe']);
 const index=JSON.parse(await P.read(root,P.KNOWLEDGE));index.entries[2].dependsOn=[];index.entries[3].revision='main def';
 await P.write(root,P.KNOWLEDGE,JSON.stringify(index));await P.write(root,'.git/HEAD','b'.repeat(40));
 r=await P.refreshEvidence(root);assert.deepEqual(r.stale,['missing','unsafe','set','revision','commit']);assert.deepEqual(r.reusable,[]);
 assert.equal((await P.refreshEvidence(root)).written,false);
});

test('PowerShell and JavaScript synchronize identical mirrors and readiness without changing decisions',async t=>{
 const a=await externalFixture(t),b=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-sync-ps-'));
 t.after(()=>fs.rm(b,{recursive:true,force:true}));
 a.c.state.acceptanceCriteria[0].criterion+='\nMeasurement Date & Time\nCreated By\nCreated On';
 await P.write(a.root,a.folder+'/pbi-state.json',JSON.stringify(a.c.state));
 await fs.cp(a.dir,b,{recursive:true});const pkg=await packageFor(a.dir);
 const js=await P.synchronizePbi(a.root,a.folder),powershell=ps(pkg,b,'SyncPbi',a.folder);
 assert.deepEqual(powershell.report,js.report);
 assert.equal(js.report.issues.some(i=>i.code==='DOC_CONTENT_MISMATCH'),false);
 assert.deepEqual(powershell.state.decisions,js.state.decisions);
 for(const file of ['DRAFT-PBI.md','EVIDENCE.md','DECISION-LOG.md','OPEN-QUESTIONS.md'])assert.equal(await fs.readFile(path.join(b,a.folder,file),'utf8'),await P.read(a.root,a.folder+'/'+file),file);
 assert.deepEqual(ps(pkg,b,'SyncPbi',a.folder).changed,[]);
});

test('PowerShell and JavaScript freshness agree on all dependency invalidations',async t=>{
 const a=await fixture(t),b=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-fresh-ps-'));
 t.after(()=>fs.rm(b,{recursive:true,force:true}));
 await P.write(a.root,'src/A.cs','class A {}');await P.write(a.root,'src/B.cs','class B {}');
 await P.write(a.root,'.git/HEAD','b'.repeat(40));
 await P.write(a.root,P.KNOWLEDGE,JSON.stringify({schemaVersion:1,entries:[
  {id:'missing',path:'src/A.cs',dependsOn:['src/Absent.cs']},
  {id:'invalid',path:'src/A.cs',dependsOn:['../External.cs']},
  {id:'changed-set',path:'src/A.cs',dependsOn:[],dependencyHashes:{'src/B.cs':'old'}},
  {id:'revision',path:'src/A.cs',revision:'new',fingerprintedRevision:'old'},
  {id:'commit',path:'src/A.cs',repositoryCommit:'a'.repeat(40)},
  {id:'new-dependency',path:'src/A.cs',sha256:await P.hash('class A {}'),dependsOn:['src/B.cs']},
  {id:'mixed-invalid-missing',path:'src/Missing.cs',dependsOn:['../External.cs']}]}));
 await fs.cp(a.dir,b,{recursive:true});const pkg=await packageFor(a.dir);
 assert.deepEqual(ps(pkg,b,'RefreshEvidence'),await P.refreshEvidence(a.root));
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(b,P.KNOWLEDGE),'utf8')),JSON.parse(await P.read(a.root,P.KNOWLEDGE)));
 assert.equal(ps(pkg,b,'RefreshEvidence').written,false);
});

test('operational workflow progress does not invalidate review snapshots; material evidence still does in both checkers',async t=>{
 const {root,dir,folder}=await fixture(t),pkg=await packageFor(dir);
 await P.synchronizePbi(root,folder);
 const before=await P.reviewFingerprint(root,folder),state=JSON.parse(await P.read(root,folder+'/pbi-state.json'));
 const progress=P.recordWorkflowProgress(state,{action:'ASK_DECISION',stage:'FINAL_REVIEW'},'input');
 await P.write(root,folder+'/pbi-state.json',JSON.stringify(progress.state));
 assert.equal(await P.reviewFingerprint(root,folder),before);
 assert.deepEqual(ps(pkg,dir,'CheckPbi',folder),await P.checkPbi(root,folder));
 progress.state.evidence[0].summary+=' Material change';
 await P.write(root,folder+'/pbi-state.json',JSON.stringify(progress.state));
 assert.notEqual(await P.reviewFingerprint(root,folder),before);
});

test('host profiles retain VS Code native Custom Response and use separate conservative Visual Studio instructions',()=>{
 const files=ide=>P.setupFiles({projectName:'Host',ide,role:'other',sources:{}},assets,'HTML').files;
 const code=files('vscode')[P.AGENT],vs=files('visualstudio')[P.AGENT];
 assert.match(code,/tools:.*vscode\/askQuestions/);assert.match(code,/VS Code profile: preserve native vscode\/askQuestions and free-text Custom Response/);
 assert.match(vs,/Visual Studio profile: no native question tool has been verified/);assert.doesNotMatch(vs,/tools:.*(?:vscode\/askQuestions|execute)/);
 for(const agent of [code,vs]){
  assert.ok(agent.slice(agent.indexOf('## Workflow router'),agent.indexOf('## Source access before analysis')).length<3500);
  assert.match(agent,/analysis\.workflow/);assert.match(agent,/-Action SyncPbi/);
 }
});

test('synchronization refuses a concurrent edit and restores earlier documents on write failure',async t=>{
 const {root,folder,dir}=await fixture(t),draft=await P.read(root,folder+'/DRAFT-PBI.md'),raw=await P.read(root,folder+'/pbi-state.json');
 const create=FileHandle.prototype.createWritable;let injected=false;
 FileHandle.prototype.createWritable=async function(){
  if(!injected&&this.path.includes(path.sep+'history'+path.sep)){
   injected=true;await fs.writeFile(path.join(dir,folder,'DRAFT-PBI.md'),'Concurrent reviewer edit');
  }
  return create.call(this);
 };
 try{await assert.rejects(P.synchronizePbi(root,folder),/changed/);}
 finally{FileHandle.prototype.createWritable=create;}
 assert.equal(await P.read(root,folder+'/DRAFT-PBI.md'),'Concurrent reviewer edit');assert.equal(await P.read(root,folder+'/pbi-state.json'),raw);
 await P.write(root,folder+'/DRAFT-PBI.md',draft);let failed=false;
 FileHandle.prototype.createWritable=async function(){
  if(!failed&&this.path===path.join(dir,folder,'EVIDENCE.md')){failed=true;throw Error('Injected mirror write failure');}
  return create.call(this);
 };
 try{await assert.rejects(P.synchronizePbi(root,folder),/Previously touched files were restored/);}
 finally{FileHandle.prototype.createWritable=create;}
 assert.equal(await P.read(root,folder+'/DRAFT-PBI.md'),draft);assert.equal(await P.read(root,folder+'/pbi-state.json'),raw);
});

test('a stale or unbound user approval asks for the new approval; other approvals and real issues still block',()=>{
 const state={pbi:'1',status:'Ready for Review',rules:[],evidence:[],questions:[],decisions:[],analysis:{requirementsComplete:true}};
 const next=(issues,status='Ready for Review')=>P.workflowNextAction({state,readiness:{computedStatus:status,claimedStatus:status,issues},requirementsComplete:true});
 for(const issue of [{code:'APPROVAL_PENDING',ref:'user'},{code:'APPROVAL_UNBOUND',ref:'user'},{code:'APPROVAL_STALE',ref:'user:BR-1 changed'}]){
  const n=next([issue]);assert.equal(n.action,'ASK_DECISION',issue.code);assert.equal(n.stage,'FINAL_REVIEW',issue.code);
 }
 assert.equal(next([{code:'APPROVAL_STALE',ref:'poba:BR-1'}]).action,'BLOCKED_EXTERNAL','an external approval is not the user approval');
 assert.equal(next([{code:'APPROVAL_STALE',ref:'user:BR-1'},{code:'NO_ACS',ref:'1'}],'Draft').action,'BLOCKED_EXTERNAL','a real issue next to a stale approval still blocks');
 assert.deepEqual(P.approvalBlockers({issues:[{code:'APPROVAL_STALE',ref:'user:x'},{code:'NO_ACS',ref:'1'}]}).map(i=>i.code),['NO_ACS']);
});

test('the agent is told that SyncPbi already returns the readiness report, so CheckPbi is not run twice',()=>{
 const cfg=P.normalizeConfig({projectName:'X',ide:'vscode',role:'legacy',sources:{},includeReferences:false});
 const agent=P.setupFiles(cfg,assets).files['.github/agents/akzo-sdd-pbi-builder.agent.md'];
 assert.match(agent.replace(/\s+/g,' '),/SyncPbi.*report is the readiness result.*do not run CheckPbi again until a PBI file changes/);
});

test('SyncPbi -RefreshEvidence does both in one PowerShell run with the same results as the two separate actions',async t=>{
 const run=(pkg,dir,args)=>{const env={...process.env,USERPROFILE:dir};delete env.PSExecutionPolicyPreference;
  const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(pkg,'Install-PBIBuilder.ps1'),'-RepoPath',dir,...args],{encoding:'utf8',env,timeout:120000});
  assert.ifError(r.error);assert.ok([0,3].includes(r.status),r.stdout+r.stderr);return r.stdout.trim();};
 const prepare=async()=>{const f=await fixture(t);
  await P.write(f.root,'src/Rule.cs','class Rule {}\n');await P.write(f.root,'src/Contract.cs','interface IContract {}\n');
  await P.write(f.root,P.KNOWLEDGE,JSON.stringify({schemaVersion:1,entries:[{id:'K-1',path:'src/Rule.cs',dependsOn:['src/Contract.cs']},{id:'K-2',path:'src/Missing.cs'}]}));
  return {...f,pkg:await packageFor(f.dir)};};
 const a=await prepare(),b=await prepare(),pbi=a.folder.split('/').pop();
 const separateEvidence=JSON.parse(run(a.pkg,a.dir,['-Action','RefreshEvidence','-Json'])),separateSync=JSON.parse(run(a.pkg,a.dir,['-Action','SyncPbi','-Pbi',pbi,'-Json']));
 assert.equal(separateSync.evidence,undefined,'SyncPbi output is unchanged without the switch');
 const preview=run(b.pkg,b.dir,['-Action','SyncPbi','-Pbi',pbi,'-RefreshEvidence','-Preview']);assert.match(preview,/Preview only/);
 assert.doesNotMatch(await P.read(b.root,P.KNOWLEDGE),/sha256/,'preview writes no fingerprint');
 const combined=JSON.parse(run(b.pkg,b.dir,['-Action','SyncPbi','-Pbi',pbi,'-RefreshEvidence','-Json']));
 assert.deepEqual(combined.evidence,separateEvidence);assert.deepEqual(combined.evidence.reusable,['K-1']);assert.deepEqual(combined.evidence.stale,['K-2']);
 assert.deepEqual(combined.report,separateSync.report);assert.deepEqual(combined.state,separateSync.state);assert.deepEqual(combined.changed,separateSync.changed);
 assert.equal(await P.read(b.root,P.KNOWLEDGE),await P.read(a.root,P.KNOWLEDGE),'same evidence index written');
 // JavaScript reaches the same verdicts on an identical third repository.
 const c=await prepare(),js=await P.refreshEvidence(c.root);
 assert.deepEqual([...js.reusable].sort(),combined.evidence.reusable);assert.deepEqual([...js.stale].sort(),combined.evidence.stale);
});
