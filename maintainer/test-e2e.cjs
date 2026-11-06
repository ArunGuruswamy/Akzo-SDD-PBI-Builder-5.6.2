'use strict';
// End-to-end workflow on real files and the real Windows PowerShell installer, over a configurable multi-repository workspace:
// install -> discover -> create PBI -> evidence reuse -> grouped decisions (recommended, custom, Decide Later) -> resume ->
// one final approval -> generated Markdown/JSON/DOCX -> approval freshness. The browser modal is covered by test-ui.cjs and by
// the browser run recorded in VALIDATION.txt; this script never claims it.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const P=require('./src/core.js'),W=require('./fixtures/workspace.cjs'),{DirectoryHandle}=require('./fixtures/fs-handles.cjs');
const env={...process.env};delete env.PSExecutionPolicyPreference;
const ps=(pkg,args)=>{const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(pkg,'Install-PBIBuilder.ps1'),...args],{encoding:'utf8',env,timeout:180000});if(r.error)throw r.error;return {code:r.status,out:r.stdout,err:r.stderr};};
let count=0;const step=async(name,fn)=>{await fn();count++;console.log('PASS',name);};
function zipEntry(bytes,name){const b=Buffer.from(bytes);let pos=0;
 while(pos+30<=b.length&&b.readUInt32LE(pos)===0x04034b50){const size=b.readUInt32LE(pos+18),n=b.readUInt16LE(pos+26),extra=b.readUInt16LE(pos+28),start=pos+30+n+extra;if(b.toString('utf8',pos+30,pos+30+n)===name)return b.toString('utf8',start,start+size);pos=start+size;}
 throw Error('Missing ZIP entry: '+name);}
const text=s=>String(s).replace(/<[^>]+>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/\s+/g,' ');

(async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-e2e-'));env.USERPROFILE=tmp;
 const assets=JSON.parse(await fs.readFile(path.join(__dirname,'src/assets.json'),'utf8')),html=await fs.readFile(path.join(__dirname,'Akzo-SDD-PBI-Builder.html'),'utf8');
 // A package folder with spaces and non-ASCII characters, as users have.
 const pkg=path.join(tmp,'package ಕನ್ನಡ & space');await fs.mkdir(pkg);
 for(const f of ['Install-PBIBuilder.ps1','Uninstall-PBIBuilder.ps1','PBI-Builder-Setup.ps1','Install-PBIBuilder.cmd','Uninstall-PBIBuilder.cmd','Install.cmd','Uninstall.cmd'])await fs.copyFile(path.join(__dirname,'installer',f),path.join(pkg,f));
 await fs.writeFile(path.join(pkg,'pbi-builder-bundle.json'),JSON.stringify(P.bundle(assets)));await fs.writeFile(path.join(pkg,'Akzo-SDD-PBI-Builder.html'),html);
 const o={feature:'Measurement',entity:'measurement'},dir=path.join(tmp,W.opts(o).workspace),files=await W.build(fs,path,dir,o),root=new DirectoryHandle(dir),R=W.opts(o).repos;
 let folder,state,metrics={};

 await step('fresh install saves every repository path, synchronizes the agent and reports configured versus read access',async()=>{
  const r=ps(pkg,['-RepoPath',dir,'-ProjectName','Workspace','-Ide','vscode','-Role','other','-LegacySource',R.legacy,'-CdmsSource',R.cdms,'-DabSource',R.dab,'-UiSource',R.ui]);assert.equal(r.code,0,r.err+r.out);
  const cfg=JSON.parse(await fs.readFile(path.join(dir,P.CONFIG),'utf8'));assert.deepEqual(cfg.sources,{legacy:R.legacy,dab:R.dab,cdms:R.cdms,ui:R.ui});
  const yaml=await fs.readFile(path.join(dir,P.BASE,'sources.yaml'),'utf8');for(const v of Object.values(R))assert.ok(yaml.includes(v),v+' reaches sources.yaml');
  for(const k of ['legacy','cdms','dab','ui'])assert.match(r.out,new RegExp('^  '+k+'\\s+readable\\s+Read ','m'),k);
  assert.ok((await fs.stat(path.join(dir,P.AGENT))).isFile());assert.match(await fs.readFile(path.join(dir,P.AGENT),'utf8'),/## Workflow router/);
 });
 await step('upgrade, repair and restart keep the repositories; nothing in the application repositories is modified',async()=>{
  const before=Object.fromEntries(await Promise.all(Object.keys(files).map(async p=>[p,await fs.readFile(path.join(dir,p),'utf8')])));
  let r=ps(pkg,['-RepoPath',dir,'-Ide','visualstudio','-AllowUpdates']);assert.equal(r.code,0,r.err+r.out);
  await fs.rm(path.join(dir,P.AGENT));r=ps(pkg,['-RepoPath',dir,'-Action','Repair']);assert.equal(r.code,0,r.err+r.out);
  r=ps(pkg,['-RepoPath',dir,'-Action','Verify']);assert.equal(r.code,0,r.err+r.out);assert.match(r.out,/^  ui\s+readable/m);
  const cfg=JSON.parse(await fs.readFile(path.join(dir,P.CONFIG),'utf8'));assert.equal(cfg.ide,'visualstudio');assert.deepEqual(cfg.sources,{legacy:R.legacy,dab:R.dab,cdms:R.cdms,ui:R.ui});
  for(const [p,t] of Object.entries(before))assert.equal(await fs.readFile(path.join(dir,p),'utf8'),t,p+' unchanged');
 });

 let cfg;
 await step('source discovery maps every configured repository once, skips build output, and an unchanged rerun reads no project file',async()=>{
  cfg=JSON.parse(await fs.readFile(path.join(dir,P.CONFIG),'utf8'));
  const cold=await P.measure(()=>P.discoverSources(root,cfg)),map=cold.result;
  assert.deepEqual(map.sources.map(s=>s.key+':'+s.status),['legacy:readable','dab:readable','cdms:readable','ui:readable']);
  const index=(await P.read(root,P.FILE_INDEX)).trim().split('\n');assert.ok(index.includes(R.ui+'/src/app/measurement/measurement.component.ts')&&index.includes(R.dab+'/Handlers/CreateMeasurementHandler.cs'));assert.ok(!index.some(p=>/node_modules|\/dist\//.test(p)),'build output and dependencies are not indexed');
  assert.ok(map.entryPoints.includes(R.dab+'/Program.cs')&&map.entryPoints.includes(R.ui+'/src/app/app.module.ts'));
  assert.deepEqual(map.projects.map(x=>x.path).sort(),[R.cdms+'/Cdms.csproj',R.dab+'/Dab.csproj',R.legacy+'/Plugins/Plugins.csproj'].sort());
  const warm=await P.measure(()=>P.discoverSources(root,cfg));assert.deepEqual(warm.result.changes,{added:[],modified:[],removed:[],reused:map.solutions.length+map.projects.length});
  assert.equal(warm.metrics.writes,0);assert.ok(warm.metrics.fileOpens<cold.metrics.fileOpens,'the unchanged rerun opens fewer files ('+warm.metrics.fileOpens+' < '+cold.metrics.fileOpens+')');
  metrics.discover={cold:cold.metrics,warm:warm.metrics};
 });
 await step('Create PBI plans the shared UI once for CDMS and DAB and records the plan with the request',async()=>{
  const access=Object.fromEntries((await P.discoverSources(root,cfg)).sources.map(s=>[s.key,s.status]));
  const made=P.newPbi(cfg,{title:'Take measurement',number:'LOCAL-1',description:'Allow an operator to save a measurement; invalid values are rejected.',acceptanceCriteria:'1. Given a valid measurement, when saved, then it is stored',application:'both',legacy:'legacy',sourceAccess:access});
  assert.deepEqual(made.request.analysisPlan.passes.map(p=>p.key),['legacy','ui','cdms','dab']);assert.equal(made.request.analysisPlan.passes.filter(p=>p.key.startsWith('ui')).length,1);
  assert.deepEqual(made.request.analysisPlan.ui.shared,true);assert.match(made.prompt,/Analysis plan \(each scan once/);
  const rows=await P.plan(root,made.files,false);await P.apply(root,rows,false);folder=made.folder;
  assert.deepEqual((await P.listPbis(root)).map(x=>x.number),['LOCAL-1']);
 });
 await step('verified findings are reused until a file or dependency changes; unchanged ones stay reusable',async()=>{
  const k=(id,p,dep)=>({id,path:p,dependsOn:[dep],repository:id,revision:'workspace'});
  await P.write(root,P.KNOWLEDGE,JSON.stringify({schemaVersion:1,entries:[k('K-C',R.cdms+'/Handlers/CreateMeasurementHandler.cs',R.cdms+'/Contracts/CreateMeasurementDto.cs'),k('K-D',R.dab+'/Handlers/CreateMeasurementHandler.cs',R.dab+'/Contracts/CreateMeasurementRequest.cs'),k('K-U',R.ui+'/src/app/measurement/measurement.component.ts',R.ui+'/src/app/measurement/measurement.service.ts')]}));
  let run=await P.measure(()=>P.refreshEvidence(root));assert.deepEqual(run.result.reusable,['K-C','K-D','K-U']);assert.equal(run.metrics.repeatedOpens,0);
  run=await P.measure(()=>P.refreshEvidence(root));assert.equal(run.result.written,false);assert.equal(run.metrics.writes,0);metrics.refresh=run.metrics;
  const svc=R.ui+'/src/app/measurement/measurement.service.ts';await P.write(root,svc,files[svc]+'// API contract changed\n');
  run=await P.measure(()=>P.refreshEvidence(root));assert.deepEqual(run.result.stale,['K-U']);assert.deepEqual(run.result.reusable,['K-C','K-D']);
  // The agent rereads only K-U, finds the PBI's own evidence unaffected, and restores the shared file as it was.
  await P.write(root,svc,files[svc]);const idx=JSON.parse(await P.read(root,P.KNOWLEDGE));for(const e of idx.entries){delete e.stale;delete e.staleReason;}await P.write(root,P.KNOWLEDGE,JSON.stringify(idx));
  run=await P.measure(()=>P.refreshEvidence(root));assert.deepEqual(run.result.stale,['K-U'],'restoring the file is itself a dependency change, so it is re-verified once');
 });

 const pbi=()=>folder.split('/').pop();
 await step('the agent record is Awaiting PO/BA Decision: open questions block, the non-blocking gap is only a warning',async()=>{
  state=await W.stateFor(P,o,pbi(),files);
  await P.write(root,folder+'/pbi-state.json',JSON.stringify(state,null,2));await P.write(root,folder+'/DRAFT-PBI.md',W.draftDoc(state,state.status));
  await P.write(root,folder+'/DECISION-LOG.md','# Decision log\n\nDEC-1 approved: stated in the original request.\n');
  const r=await P.checkPbi(root,folder,true);assert.equal(r.computedStatus,'Awaiting PO/BA Decision');
  assert.deepEqual(r.issues.map(i=>i.code+' '+i.ref).filter(x=>/^BLOCKING_QUESTION/.test(x)),['BLOCKING_QUESTION Q-1','BLOCKING_QUESTION Q-2','BLOCKING_QUESTION Q-3']);
  assert.ok(!r.issues.some(i=>i.code==='EVIDENCE_GAP'),'an INFORMATIONAL gap is not a blocker');assert.deepEqual(r.warnings.map(w=>w.code+' '+w.ref+' '+w.impact),['GAP_OPEN BR-1/GAP-1 INFORMATIONAL']);
 });
 await step('grouped decisions: a recommendation stays a suggestion until confirmed; custom answer and Decide Later are saved',async()=>{
  const q=P.questionProgress(state);assert.equal(q.total,3);assert.equal(q.answered,0);assert.equal(state.decisions.length,1,'no recommendation was auto-approved');
  const by='Business reviewer';
  const saved=await P.recordAnswers(root,folder,[{id:'Q-1',option:'A',by},{id:'Q-2',option:'custom',custom:'All business units except training units',by},{id:'Q-3',option:'later',by}],{expectedState:JSON.stringify(state)});
  const s=JSON.parse(await P.read(root,folder+'/pbi-state.json'));const q1=s.questions.find(x=>x.id==='Q-1'),q2=s.questions.find(x=>x.id==='Q-2'),q3=s.questions.find(x=>x.id==='Q-3');
  assert.equal(q1.status,'answered');assert.equal(q1.answer.option,'A');assert.equal(q2.answer.option,'custom');assert.equal(q2.answer.text,'All business units except training units');assert.equal(q3.status,'deferred');
  assert.deepEqual(s.decisions.map(d=>d.id+':'+d.status),['DEC-1:approved','DEC-2:approved','DEC-3:approved']);assert.match(await P.read(root,folder+'/DECISION-LOG.md'),/DEC-2 \(approved\): Q-1[\s\S]*DEC-3 \(approved\): Q-2/);
  assert.ok((await fs.readdir(path.join(dir,folder,'history'))).some(n=>/^pbi-state\..*\.json$/.test(n)),'the prior state is kept in history');assert.equal(saved.state.decisions.length,3);
 });
 await step('resume in a fresh session asks only what is unresolved; an earlier selection can be edited without repeating questions',async()=>{
  state=JSON.parse(await P.read(root,folder+'/pbi-state.json'));const q=P.questionProgress(state);
  assert.equal(q.next,null,'nothing is waiting except the deferred question');assert.deepEqual(q.deferred,['Q-3']);assert.deepEqual(q.answeredQuestions.map(x=>x.id),['Q-1','Q-2']);
  await P.recordAnswers(root,folder,[{id:'Q-3',option:'A',by:'Business reviewer'}]);
  // Editing a previous selection supersedes its decision and keeps the history.
  await P.recordAnswers(root,folder,[{id:'Q-2',option:'A',by:'Business reviewer'}]);
  state=JSON.parse(await P.read(root,folder+'/pbi-state.json'));
  assert.deepEqual(state.decisions.map(d=>d.id+':'+d.status),['DEC-1:approved','DEC-2:approved','DEC-3:superseded','DEC-4:approved','DEC-5:approved']);assert.equal(state.decisions.find(d=>d.id==='DEC-5').supersedes,'DEC-3');
  assert.deepEqual(P.questionProgress(state).deferred,[]);assert.equal(P.questionProgress(state).next,null);assert.equal(P.questionProgress(state).answered,3);
  const continuation=P.workflowNextAction({state,readiness:{computedStatus:'Needs Evidence'},moreAnalysisRequired:true});
  assert.equal(continuation.action,'AUTO_CONTINUE');assert.equal(continuation.stage,'IMPLEMENTATION_ANALYSIS');
  // The agent moves the draft to Ready for Review; the readiness check agrees and only the one final approval is missing.
  state.status='Ready for Review';await P.write(root,folder+'/pbi-state.json',JSON.stringify(state,null,2));await P.write(root,folder+'/DRAFT-PBI.md',W.draftDoc(state,'Ready for Review'));
  const r=await P.checkPbi(root,folder,true);assert.equal(r.computedStatus,'Ready for Review');assert.deepEqual(P.approvalBlockers(r).map(i=>i.code),[],'the only open item is the user approval itself');
  assert.deepEqual(r.issues.map(i=>i.code),['APPROVAL_PENDING'],'PO/BA and technical approvals are not required by default');assert.equal(r.warnings.length,1);
 });
 await step('five technical gaps automatically generate a conditional PBI without changing decisions or final approval',async()=>{
  const conditionalDir=await fs.mkdtemp(path.join(tmp,'conditional-'));await fs.cp(dir,conditionalDir,{recursive:true});
  const conditionalRoot=new DirectoryHandle(conditionalDir),beforeState=await P.read(conditionalRoot,folder+'/pbi-state.json');
  const gaps=[
   {id:'EXT-CMS',classification:'EXTERNAL_DEPENDENCY',readinessRefs:['EXT-CMS']},
   {id:'RUN-CRM',classification:'RUNTIME_VERIFICATION',readinessRefs:['RUN-CRM']},
   {id:'EXT-AUDIT',classification:'EXTERNAL_DEPENDENCY',readinessRefs:['EXT-AUDIT']},
   {id:'EXT-INSTRUMENT',classification:'EXTERNAL_DEPENDENCY',readinessRefs:['EXT-INSTRUMENT']},
   {id:'RUN-CONNECTION',classification:'RUNTIME_VERIFICATION',readinessRefs:['RUN-CONNECTION']}];
  const readiness={computedStatus:'Needs Evidence',issues:gaps.map(g=>({code:'EVIDENCE_GAP',ref:g.id}))};
  const initial=JSON.parse(beforeState),run=await P.advanceWorkflow(conditionalRoot,folder,{gaps,requirementsComplete:true});
  assert.equal(run.next.action,'REFINEMENT_COMPLETE');assert.equal(run.next.conditional,true);assert.equal(run.report.finalAllowed,false);
  assert.deepEqual(run.state.decisions,initial.decisions);assert.equal(run.state.approvals.user.status,'pending');
  assert.equal(run.state.analysis.workflowChoices,undefined);
  const generatedDependencies=run.state.analysis.conditionalPlan.technicalDependencies;
  assert.ok(generatedDependencies.length>=5);
  for(const gap of gaps)assert.ok(generatedDependencies.some(item=>item.id===gap.id),gap.id);
  assert.ok(run.state.analysis.conditionalPlan.acceptanceCriteria.length>0);
  assert.ok(run.state.analysis.conditionalPlan.testTasks.length>0);
  assert.match(await P.read(conditionalRoot,folder+'/DRAFT-PBI.md'),/CONDITIONAL working draft only/);
  assert.match(await P.read(conditionalRoot,folder+'/OPEN-QUESTIONS.md'),/external verification tasks/);
  for(const name of ['Refined-PBI-CDMS.md','Refined-PBI-DAB.md','Refined-PBI-UI.md','REFINED-PBI.md'])assert.equal(await P.read(conditionalRoot,folder+'/'+name),null);
  const draft=await P.read(conditionalRoot,folder+'/DRAFT-PBI.md');
  const resumed=await P.advanceWorkflow(conditionalRoot,folder,{gaps,requirementsComplete:true});
  assert.equal(resumed.next.action,'REFINEMENT_COMPLETE');assert.equal(await P.read(conditionalRoot,folder+'/DRAFT-PBI.md'),draft);
 });
 await step('PowerShell chat approval refuses sensitive working-document content without recording approval',async()=>{
  const requestPath=folder+'/REQUEST.md',request=await P.read(root,requestPath);
  await P.write(root,requestPath,request+'\nclient_secret: "Abcdef12345!Secret"\n');
  const review=await P.checkPbi(root,folder,true),stateBefore=await P.read(root,folder+'/pbi-state.json');
  const result=ps(pkg,['-RepoPath',dir,'-Action','ApproveAndGenerate','-Pbi',pbi(),'-Approver','Chat reviewer','-ReviewedContent',review.reviewedContent]);
  assert.equal(result.code,2);assert.match(result.err,/Sensitive data found/);assert.equal(await P.read(root,folder+'/pbi-state.json'),stateBefore);
  await P.write(root,requestPath,request);
 });
 let final;
 await step('one final approval generates the target documents; Markdown, JSON and DOCX agree and carry the warning',async()=>{
  const review=await P.checkPbi(root,folder,true),run=await P.measure(()=>P.approveAndGenerate(root,folder,'Final approver',review.reviewedContent));final=run.result;metrics.approve=run.metrics;
  assert.equal(final.check.computedStatus,'Development-Ready');assert.deepEqual(final.documents,['Refined-PBI-CDMS.md','Refined-PBI-DAB.md','Refined-PBI-UI.md']);assert.deepEqual(final.check.issues,[]);
  const st=JSON.parse(await P.read(root,folder+'/pbi-state.json'));assert.equal(st.approvals.user.status,'approved');assert.equal(st.approvals.poba.status,'pending');assert.equal(st.approvals.technical.status,'pending');
  const line='BR-1: The audit-trail side effect of the legacy plugin is not verified (informational evidence gap; does not block the PBI)';
  for(const n of ['Refined-PBI-CDMS','Refined-PBI-DAB','Refined-PBI-UI']){
   const md=await P.read(root,folder+'/'+n+'.md'),json=JSON.parse(await P.read(root,folder+'/'+n+'.json')),docx=text(zipEntry(await fs.readFile(path.join(dir,folder,n+'.docx')),'word/document.xml'));
   assert.ok(md.includes(line),n+' markdown lists the warning');assert.ok(json.openIssues.includes(line),n+' json lists the warning');assert.ok(docx.includes(line),n+' docx lists the warning');
   for(const id of ['BR-1','BR-2','AC-1','AC-2','AC-3','AC-4']){assert.ok(md.includes(id),n+' md '+id);assert.ok(docx.includes(id),n+' docx '+id);}
   assert.equal(json.approval.user.by,'Final approver');assert.ok(md.includes('Final approver'));assert.ok(docx.includes('Final approver'));
   const own=json.rules.map(r=>r.id);assert.deepEqual(own,n==='Refined-PBI-UI'?['BR-1','BR-2']:['BR-1'],n+' owns only its rules; the shared UI work is written once, in Refined-PBI-UI');
   assert.equal(md.includes('### BR-2'),n==='Refined-PBI-UI');assert.equal(json.relatedRules.includes('BR-2'),n!=='Refined-PBI-UI');
   for(const r of json.rules)assert.ok(md.includes('### '+r.id));
  }
  assert.ok(final.files.every(f=>/^[0-9a-f]{64}$/.test(f.sha256)),'every generated file is verified by hash');
 });
 await step('Copilot Chat approval uses the PowerShell generator with the reviewed fingerprint',async()=>{
  const review=await P.checkPbi(root,folder,true);
  const r=ps(pkg,['-RepoPath',dir,'-Action','ApproveAndGenerate','-Pbi',pbi(),'-Approver','Chat reviewer','-ReviewedContent',review.reviewedContent]);
  assert.equal(r.code,0,r.err+r.out);assert.match(r.out,/Approved and generated:/);
  const state=JSON.parse(await P.read(root,folder+'/pbi-state.json'));assert.equal(state.approvals.user.by,'Chat reviewer');assert.equal(state.approvals.user.evidence,'Approve & Generate in Copilot Chat');
  const after=await P.checkPbi(root,folder,true);assert.equal(after.computedStatus,'Development-Ready');assert.deepEqual(after.issues,[]);
  for(const name of final.documents){
   const base=name.slice(0,-3),md=await P.read(root,folder+'/'+name),json=JSON.parse(await P.read(root,folder+'/'+base+'.json')),docx=zipEntry(await fs.readFile(path.join(dir,folder,base+'.docx')),'word/document.xml');
   assert.ok(md.includes('Development-Ready')&&md.includes('Chat reviewer'));assert.equal(json.status,'Development-Ready');assert.ok(docx.includes('Development-Ready'));
   if(name==='Refined-PBI-CDMS.md'){assert.deepEqual(json.rules.map(x=>x.id),['BR-1']);assert.deepEqual(json.relatedRules,['BR-2']);}
   if(name==='Refined-PBI-DAB.md'){assert.deepEqual(json.rules.map(x=>x.id),['BR-1']);assert.deepEqual(json.relatedRules,['BR-2']);}
   if(name==='Refined-PBI-UI.md'){assert.deepEqual(json.rules.map(x=>x.id),['BR-1','BR-2']);assert.deepEqual(json.relatedRules,[]);}
  }
  const stateBeforeStale=await P.read(root,folder+'/pbi-state.json'),stale=ps(pkg,['-RepoPath',dir,'-Action','ApproveAndGenerate','-Pbi',pbi(),'-Approver','Chat reviewer','-ReviewedContent','0'.repeat(64)]);
  assert.equal(stale.code,2);assert.match(stale.err,/changed after review/);assert.equal(await P.read(root,folder+'/pbi-state.json'),stateBeforeStale);
 });
 await step('PowerShell reports exactly what core reports for the approved PBI, and a changed evidence source makes the approval stale',async()=>{
  const c=ps(pkg,['-RepoPath',dir,'-Action','CheckPbi','-Pbi',pbi(),'-Json']);assert.equal(c.code,0,c.err);assert.deepEqual(JSON.parse(c.out),await P.checkPbi(root,folder));
  const src=R.dab+'/Handlers/CreateMeasurementHandler.cs';await P.write(root,src,files[src]+'// edited after approval\n');
  let r=await P.checkPbi(root,folder);assert.equal(r.computedStatus,'Needs Evidence');assert.ok(r.issues.some(i=>i.code==='EVIDENCE_CHANGED'&&i.ref==='EV-3'));assert.ok(r.issues.some(i=>i.code==='APPROVAL_STALE'));
  const c2=ps(pkg,['-RepoPath',dir,'-Action','CheckPbi','-Pbi',pbi(),'-Json']);assert.equal(c2.code,3);assert.deepEqual(JSON.parse(c2.out),r);
  await P.write(root,src,files[src]);r=await P.checkPbi(root,folder);assert.equal(r.computedStatus,'Development-Ready');assert.deepEqual(r.issues,[]);
 });
 await step('no PO/BA or technical approval gate is added: the user approval is the only required one',async()=>{
  const st=JSON.parse(await P.read(root,folder+'/pbi-state.json')),again=await P.checkPbi(root,folder,true);assert.deepEqual(P.approvalBlockers(again),[]);
  assert.equal(st.approvals.poba.status,'pending');assert.deepEqual(P.READINESS.requiredApprovals,['user']);
 });

 console.log('\nMetrics (this run, not a promise): '+JSON.stringify({discoverColdBytes:metrics.discover.cold.bytesRead,discoverWarmBytes:metrics.discover.warm.bytesRead,discoverColdOpens:metrics.discover.cold.fileOpens,discoverWarmOpens:metrics.discover.warm.fileOpens,refreshOpens:metrics.refresh.fileOpens,approveOpens:metrics.approve.fileOpens,approveRepeatedOpens:metrics.approve.repeatedOpens}));
 console.log(`\n${count} end-to-end checks passed (real files, real Windows PowerShell installer, core engine; browser rendering is tested separately).`);
 await fs.rm(tmp,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exitCode=1;});
