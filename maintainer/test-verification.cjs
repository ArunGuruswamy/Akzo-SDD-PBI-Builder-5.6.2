'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const P=require('./src/core.js'),{DirectoryHandle}=require('./fixtures/fs-handles.cjs');
const assets=JSON.parse(require('node:fs').readFileSync(path.join(__dirname,'src/assets.json'),'utf8'));
const labels=['Industry Variant Color Name filtering','Industrialization duplicate IR and New Sample validation','Paint System Level binding and persistence','Measurement override confirmation and replacement','Developed-only formulation and Predicted exclusion'];
async function fixture(t,prefix='playbook/pbis'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-306618-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'.git'));
 const root=new DirectoryHandle(dir),folder=prefix+'/pbi-306618-industrialization';
 const state={schemaVersion:2,pbi:folder.split('/').pop(),status:'Draft',paths:{ui:{applies:true},cdms:{applies:false},dab:{applies:false},ocp:{applies:false}},
  rules:labels.map((rule,i)=>({id:'BR-'+(i+1),rev:1,rule,context:'Industrialization fixture',owner:{type:'none'},targetAction:'implement',implementation:{ui:'unverified'},evidence:[],gaps:[]})),
  evidence:[],acceptanceCriteria:[],decisions:[{id:'DEC-1',pbi:folder.split('/').pop(),status:'approved',decision:'Retain the existing approved target',evidence:'Fixture user answer'}],
  questions:[{id:'Q-SCOPE',owner:'po-ba',blocking:true,status:'unanswered',question:'Should the Developed-only restriction also apply when editing an existing non-Industrialized paint system?',
   recommended:'A',recommendationWhy:'Preserve unrelated existing workflows unless scope explicitly changes.',options:[{key:'A',text:'Restrict only Industrialization; preserve other workflows.'},{key:'B',text:'Apply to every paint-system workflow.'}]}],
  analysis:{requirementsComplete:true,gaps:[]},sourceAccess:[{source:'ui',path:'projects/ui',status:'readable',checkedFile:'projects/ui/paint-system.ts'}],approvals:{user:{status:'pending'}}};
 await P.write(root,folder+'/pbi-state.json',JSON.stringify(state));
 await P.write(root,folder+'/pbi.json',JSON.stringify({number:'306618',title:'Industrialization',description:'Original intake, unchanged',wizard:{step:'analysis'}}));
 await P.write(root,folder+'/REQUEST.md','# Original fixture request\n');
 await P.write(root,'projects/ui/paint-system.ts','// Fixture only: component, service, contract, validator and test references.\n');
 return {dir,root,folder,state};
}
async function finding(root,task,status='VERIFIED_IMPLEMENTED'){
 const source='projects/ui/paint-system.ts',e={id:'EV-'+task.rule,kind:'repo-file',system:'ui',level:'code',verification:'VERIFIED',source,location:'Fixture trace, line 1',sha256:await P.hash(await P.read(root,source)),summary:'Explicit fixture source observation'};
 const record={rule:task.rule,application:'ui',status,summary:'Fixture execution chain inspected, not an actual application finding.',evidence:[e.id],
  facets:Object.fromEntries(P.VERIFICATION_FACETS.map(k=>[k,{status:'checked',evidence:[e.id]}]))};
 if(status==='PARTIALLY_IMPLEMENTED')Object.assign(record,{missingBehavior:'Fixture has no Industrialization-specific restriction.',implementationTasks:['Implement the scoped restriction.'],testTasks:['Test positive, negative and unrelated workflows.']});
 return {record,evidence:[e]};
}
test('306618 automatically verifies five accessible UI rules before a genuine decision, and resumes without repeated work',async t=>{
 const {root,folder,state}=await fixture(t),seen=[],request=await P.read(root,folder+'/REQUEST.md'),source=await P.read(root,'projects/ui/paint-system.ts');
 const measured=await P.measure(()=>P.verifyAccessibleRules(root,folder,async task=>{seen.push(task.rule);return finding(root,task,task.rule==='BR-3'?'VERIFIED_IMPLEMENTED':'PARTIALLY_IMPLEMENTED');}));
 const run=measured.result;
 assert.deepEqual(seen,['BR-1','BR-2','BR-3','BR-4','BR-5']);assert.equal(run.next.action,'ASK_DECISION');
 assert.deepEqual(run.state.decisions,state.decisions);assert.equal(run.state.analysis.ruleVerifications.length,5);assert.deepEqual(P.ruleVerificationWork(run.state),[]);
 assert.ok(run.state.rules.every(r=>r.evidence.includes('EV-'+r.id)));
 assert.equal(await P.read(root,folder+'/REQUEST.md'),request);assert.equal(await P.read(root,'projects/ui/paint-system.ts'),source);
 assert.match(await P.read(root,folder+'/VALIDATION-MATRIX.md'),/BR-3.*VERIFIED_IMPLEMENTED/);
 assert.match(await P.read(root,folder+'/DRAFT-PBI.md'),/implementationTasks:.*scoped restriction/);
 const again=await P.verifyAccessibleRules(root,folder,()=>assert.fail('Unchanged source must not be re-investigated.'));assert.equal(again.next.action,'ASK_DECISION');
 assert.equal(again.next.decision.recommended,'A');assert.equal(again.next.decision.allowCustom,true);assert.ok(again.next.decision.options.some(o=>o.key==='CUSTOM'));
 await P.recordAnswer(root,folder,'Q-SCOPE',{option:'custom',custom:'Only Industrialization, including edits of that type.',by:'Fixture user'});
 const answered=await P.advanceWorkflow(root,folder);assert.equal(P.questionProgress(answered.state).next,null);assert.notEqual(answered.next.stage,'REQUIREMENT_CLARIFICATION');
 assert.equal(answered.state.decisions[0].decision,state.decisions[0].decision);assert.ok(measured.metrics.fileOpens>0);
 await P.write(root,'projects/ui/paint-system.ts','// Changed fixture implementation.\n');
 const changed=await P.advanceWorkflow(root,folder);assert.equal(changed.next.action,'AUTO_VERIFY');assert.equal(changed.next.work.length,5);
});
test('component presence is not proof; missing facets, stale evidence and absence without searched scope fail',async t=>{
 const {root,state}=await fixture(t),f=await finding(root,{rule:'BR-1'});state.evidence=f.evidence;
 assert.throws(()=>P.recordRuleVerification(state,{rule:'BR-1',application:'ui',status:'VERIFIED_IMPLEMENTED',summary:'Component exists',evidence:[]}),/supporting evidence/);
 assert.throws(()=>P.recordRuleVerification(state,{...f.record,facets:{}}),/checked scope/);
 assert.throws(()=>P.recordRuleVerification({...state,evidence:[{...f.evidence[0],stale:true}]},f.record),/current, verified/);
 assert.throws(()=>P.recordRuleVerification(state,{...f.record,status:'VERIFIED_MISSING'}),/searched scope/);
 assert.throws(()=>P.recordRuleVerification(state,{...f.record,status:'PARTIALLY_IMPLEMENTED'}),/implementation and test tasks/);
 const saved=P.recordRuleVerification(state,f.record);saved.evidence[0].sha256='changed';assert.equal(P.ruleVerificationWork(saved).length,5);
});
test('runtime and source limitations create actionable gaps without implementation claims',async t=>{
 const {root,folder,state}=await fixture(t),f=await finding(root,{rule:'BR-1'});state.evidence=f.evidence;
 let saved=P.recordRuleVerification(state,{...f.record,status:'UNVERIFIED_RUNTIME',verificationTask:'Deployment owner: test replacement Yes, No and dismissal against persisted measurements.'});
 assert.equal(saved.analysis.gaps[0].classification,'RUNTIME_VERIFICATION');assert.ok(!P.ruleVerificationWork(saved).some(w=>w.rule==='BR-1'));
 assert.equal(saved.rules[0].gaps[0].impact,'BLOCKING');
 assert.throws(()=>P.recordRuleVerification(saved,f.record),/Runtime blockers require verified runtime evidence/);
 const report=await P.readiness(saved,{},saved.pbi);assert.ok(report.issues.some(i=>i.ref==='BR-1'&&i.code==='EVIDENCE_GAP'));
 saved.sourceAccess[0].status='configured-inaccessible';
 const facets=Object.fromEntries(P.VERIFICATION_FACETS.map(k=>[k,{status:'unavailable',reason:'The configured path cannot be opened.'}]));
 saved=P.recordRuleVerification(saved,{rule:'BR-2',application:'ui',status:'UNVERIFIED_SOURCE',summary:'Configured source is inaccessible.',evidence:[],facets,sourceFailure:'readfile projects/ui: access denied',verificationTask:'Workspace owner: restore read access to the configured path.'});
 assert.equal(saved.rules[1].gaps[0].impact,'BLOCKING');
 assert.ok(!P.ruleVerificationWork(saved).some(w=>w.rule==='BR-2'));saved.sourceAccess[0].status='readable';assert.ok(P.ruleVerificationWork(saved).some(w=>w.rule==='BR-2'));
 assert.equal(P.workflowNextAction({state:saved,readiness:{computedStatus:'Ready for Review'},gaps:saved.analysis.gaps}).action,'AUTO_VERIFY');
 const allVerified=await P.verifyAccessibleRules(root,folder,async task=>finding(root,task));
 const unresolved=P.recordRuleVerification(allVerified.state,{...f.record,status:'UNVERIFIED_RUNTIME',verificationTask:'Service owner: verify persistence in the deployed operation.'});
 unresolved.questions=[];
 const blocked=P.workflowNextAction({state:unresolved,readiness:{computedStatus:'Development-Ready',issues:[]},gaps:unresolved.analysis.gaps,requirementsComplete:true,artifactsAvailable:true});
 assert.equal(blocked.action,'GENERATE_CONDITIONAL_PBI');assert.equal(blocked.finalAllowed,false);assert.notEqual(blocked.action,'COMPLETE');
});
test('root and Source/playbook layouts cache failed probes, reject ambiguity and retain configured source paths',async t=>{
 const {root,folder}=await fixture(t,'Source/playbook/pbis');
 await P.write(root,P.CONFIG,JSON.stringify(P.normalizeConfig({projectName:'Fixture',ide:'vscode',role:'other',sources:{ui:'../Configured UI'}})));
 const first=await P.measure(()=>P.resolveWorkspace(root)),warm=await P.measure(()=>P.resolveWorkspace(root));
 assert.equal(first.result.sources.ui,'../Configured UI');assert.equal(warm.metrics.fileOpens,0);assert.equal(warm.metrics.entriesListed,0);assert.ok(first.result.missing.includes('playbook/pbis'));
 assert.equal((await P.resolvePbiLocation(root,'306618')).folder,folder);await P.synchronizePbi(root,folder);assert.ok(await P.read(root,folder+'/VALIDATION-MATRIX.md'));
 const other='playbook/pbis/'+folder.split('/').pop();await P.write(root,other+'/pbi.json',JSON.stringify({number:'306618',title:'Second explicit version'}));
 await assert.rejects(P.resolvePbiLocation(root,'306618'),/Multiple PBI folders/);assert.equal((await P.resolvePbiLocation(root,folder)).folder,folder);
 await assert.rejects(P.checkPbi(root,'Source/playbook/pbis/../other'),/Invalid relative/);
});
test('both host profiles preserve native/custom interaction and require automatic tracing, not continue prompts',()=>{
 for(const ide of ['vscode','visualstudio']){
  const files=P.setupFiles({projectName:'306618',ide,role:'other',sources:{ui:'../UI'}},assets,'<html></html>').files,agent=files[P.AGENT],guided=files[P.BASE+'/skills/guided-pbi-creation.md'];
  assert.match(guided,/Never ask "Would you like me to continue\?"/);assert.match(guided,/component ->\nAngular template/);
  for(const status of P.RULE_CLASSIFICATIONS)assert.ok(guided.includes(status));
  assert.match(guided,/persist its answer[\s\S]*continue automatically/);
  if(ide==='vscode')assert.match(agent,/tools:.*vscode\/askQuestions/);else assert.doesNotMatch(agent.split('---')[1],/vscode\/askQuestions/);
  const router=agent.slice(agent.indexOf('## Workflow router'),agent.indexOf('## Source access before analysis'));assert.ok(router.length<3500);
 }
});
test('Source/playbook synchronization and source-qualified foreign evidence retain JavaScript/PowerShell parity',async t=>{
 const {dir,root,folder}=await fixture(t,'Source/playbook/pbis'),pkg=path.join(dir,'package');await fs.mkdir(pkg);
 await fs.copyFile(path.join(__dirname,'installer/Install-PBIBuilder.ps1'),path.join(pkg,'Install-PBIBuilder.ps1'));
 await fs.writeFile(path.join(pkg,'pbi-builder-bundle.json'),JSON.stringify(P.bundle(assets)));await fs.writeFile(path.join(pkg,'Akzo-SDD-PBI-Builder.html'),'<html></html>');
 const source='Source/playbook/pbis/another-pbi/EVIDENCE.md';await P.write(root,source,'Foreign PBI, never implementation evidence.');
 const state=JSON.parse(await P.read(root,folder+'/pbi-state.json'));state.evidence.push({id:'EV-FOREIGN',kind:'repo-file',system:'ui',level:'code',verification:'VERIFIED',source,location:'line 1',sha256:await P.hash(await P.read(root,source)),summary:'Foreign content must be excluded.'});
 const runtime=await finding(root,{rule:'BR-2'});state.evidence.push(...runtime.evidence);
 const limited=P.recordRuleVerification(state,{...runtime.record,status:'UNVERIFIED_RUNTIME',verificationTask:'Service owner: verify the persisted operation before closing this blocker.'});
 await P.write(root,folder+'/pbi-state.json',JSON.stringify(limited));
 await P.write(root,folder+'/READINESS.json','{invalid derived JSON');
 const env={...process.env};delete env.PSExecutionPolicyPreference;
 const result=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(pkg,'Install-PBIBuilder.ps1'),'-RepoPath',dir,'-Action','SyncPbi','-Pbi',folder,'-Json'],{encoding:'utf8',env,timeout:120000});
 assert.ifError(result.error);assert.equal(result.status,0,result.stdout+result.stderr);
 assert.match(result.stderr,/Repairing invalid derived READINESS/);
 const ps=JSON.parse(result.stdout.trim()),js=await P.synchronizePbi(root,folder);assert.deepEqual(ps.report,js.report);assert.deepEqual(js.changed,[]);
 assert.ok(js.report.issues.some(i=>i.code==='FOREIGN_PBI_EVIDENCE'));
 assert.ok(js.report.issues.some(i=>i.code==='EVIDENCE_GAP'&&i.ref==='BR-2'));
 const history=await fs.readdir(path.join(dir,folder,'history'));
 const reportBackups=await Promise.all(history.filter(n=>n.startsWith('READINESS.json.')).map(n=>fs.readFile(path.join(dir,folder,'history',n),'utf8')));
 assert.ok(reportBackups.includes('{invalid derived JSON'));
});
test('read-only investigation adapter refuses invented fingerprints and exits on unchanged automatic work',async t=>{
 const {root,folder}=await fixture(t);
 await assert.rejects(P.verifyAccessibleRules(root,folder,async task=>{const f=await finding(root,task);f.evidence[0].sha256='invented';return f;}),/not read/);
 const raw=JSON.parse(await P.read(root,folder+'/pbi-state.json'));delete raw.analysis.workflow;delete raw.sourceAccess;await P.write(root,folder+'/pbi-state.json',JSON.stringify(raw));
 await P.write(root,P.CONFIG,JSON.stringify(P.normalizeConfig({projectName:'306618',ide:'vscode',role:'other',sources:{ui:'projects/ui'}})));
 let calls=0;
 const run=await P.verifyAccessibleRules(root,folder,async task=>{calls++;return {record:{rule:task.rule,application:'ui',status:'UNVERIFIED_SOURCE',summary:'The configured path failed.',evidence:[],sourceFailure:'readfile failed: access denied',
  verificationTask:'Application owner: restore read access to the configured path.',facets:Object.fromEntries(P.VERIFICATION_FACETS.map(k=>[k,{status:'unavailable',reason:'Source access denied.'}]))}};});
 assert.equal(run.next.action,'ASK_DECISION');assert.equal(calls,1);assert.equal(run.state.sourceAccess[0].status,'configured-inaccessible');
});