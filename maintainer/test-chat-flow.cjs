'use strict';
// Chat-first refinement end to end, on real files: Draft -> validation -> user decisions -> review -> refined PBI.
// At every step the next action must continue automatically, ask the next necessary question, or name a blocker;
// it never stops silently and never reports completion while only a draft exists. Approval uses the real PowerShell
// ApproveAndGenerate action, as Copilot Chat does. The model's own chat behavior is not tested here (it needs the IDE).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const P=require('./src/core.js'),W=require('./fixtures/workspace.cjs'),{DirectoryHandle}=require('./fixtures/fs-handles.cjs');
const assets=JSON.parse(require('node:fs').readFileSync(path.join(__dirname,'src/assets.json'),'utf8'));
const FINAL=['Refined-PBI-CDMS','Refined-PBI-DAB','Refined-PBI-UI'];

async function workspace(t){
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-chat-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));
 const o={feature:'Measurement',entity:'measurement'},dir=path.join(tmp,W.opts(o).workspace),files=await W.build(fs,path,dir,o),root=new DirectoryHandle(dir);
 const config=P.normalizeConfig(W.configFor(o));
 await P.apply(root,await P.plan(root,P.setupFiles(config,assets,'<html></html>').files,true),true);
 await P.discoverSources(root,config);
 const made=P.newPbi(config,{number:'7001',title:'Measurement validation',description:'Validate measurements before saving',application:'both',legacy:'legacy'});
 await P.apply(root,await P.plan(root,made.files));
 const folder=made.folder,state=await W.stateFor(P,o,folder.split('/').pop(),files);
 await P.write(root,folder+'/pbi-state.json',JSON.stringify(state,null,2));await P.write(root,folder+'/DRAFT-PBI.md',W.draftDoc(state,state.status));
 await P.write(root,folder+'/DECISION-LOG.md','# Decision log\n\nDEC-1 approved: stated in the original request.\n');
 const pkg=path.join(tmp,'package');await fs.mkdir(pkg);
 await fs.copyFile(path.join(__dirname,'installer/Install-PBIBuilder.ps1'),path.join(pkg,'Install-PBIBuilder.ps1'));
 await fs.writeFile(path.join(pkg,'pbi-builder-bundle.json'),JSON.stringify(P.bundle(assets)));await fs.writeFile(path.join(pkg,'Akzo-SDD-PBI-Builder.html'),'<html></html>');
 const env={...process.env,USERPROFILE:tmp};delete env.PSExecutionPolicyPreference;
 const ps=(...args)=>{const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(pkg,'Install-PBIBuilder.ps1'),'-RepoPath',dir,...args],{encoding:'utf8',env,timeout:180000});
  assert.ifError(r.error);return {code:r.status,out:r.stdout,err:r.stderr};};
 return {dir,root,folder,state,ps,config};
}
const stateOf=async(w)=>JSON.parse(await P.read(w.root,w.folder+'/pbi-state.json'));
const finalFiles=async w=>(await Promise.all(FINAL.flatMap(n=>['.md','.json','.docx'].map(async x=>(await P.read(w.root,w.folder+'/'+n+x))!==null)))).filter(Boolean).length;
// Every next action is one of: continue, a question with choices, a named blocker, or a completion backed by final files.
async function assertNoSilentStop(w,run,label){
 const n=run.next,files=await finalFiles(w);
 assert.ok(['AUTO_CONTINUE','AUTO_VERIFY','RECORD_GAP','VALIDATE','GENERATE_CONDITIONAL_PBI','ASK_DECISION','BLOCKED_EXTERNAL','REFINEMENT_COMPLETE','COMPLETE'].includes(n.action),label+': known action');
 assert.ok(typeof n.next==='string'&&n.next.length>10,label+': says what happens next');
 if(n.action==='ASK_DECISION'||n.action==='BLOCKED_EXTERNAL')assert.ok(n.decision&&n.decision.options.some(o=>o.key==='CUSTOM'||/Custom Response/.test(o.text)),label+': a question with a custom answer');
 if(n.action==='COMPLETE')assert.equal(files,9,label+': completion only with every final file');
 if(n.action==='REFINEMENT_COMPLETE'){assert.equal(n.finalAllowed,false);assert.doesNotMatch(n.next,/completed refinement/i,label+': a draft is not reported as complete');}
 if(run.report.computedStatus==='Ready for Review')assert.equal(n.stage,'FINAL_REVIEW',label+': a reviewable PBI asks for the final review, never stops at the draft');
}

test('chat flow: questions with recommendation, custom answer and Decide later, pending decision, review, explicit approval, refined PBI',async t=>{
 const w=await workspace(t);let run;

 await t.test('analysis runs first; the first question has an evidence-backed recommendation, alternatives, Custom Response and Decide later',async()=>{
  run=await P.advanceWorkflow(w.root,w.folder);await assertNoSilentStop(w,run,'start');
  assert.equal(run.next.action,'ASK_DECISION');assert.equal(run.next.stage,'REQUIREMENT_CLARIFICATION');
  assert.equal(run.next.decision.question,w.state.questions[0].question);assert.equal(run.next.decision.recommended,'A');
  assert.ok(run.next.decision.why.length>20,'the recommendation says why');
  assert.deepEqual(run.next.decision.options.map(o=>o.key),['A','B','CUSTOM','LATER']);assert.match(run.next.decision.options.at(-1).text,/Decide later[\s\S]*not approved/);
  assert.deepEqual((await stateOf(w)).decisions.map(d=>d.id),['DEC-1'],'a recommendation is never recorded as a decision by itself');
 });
 await t.test('a multiple-choice answer is saved at once with who and how; the next required question follows',async()=>{
  await P.recordAnswer(w.root,w.folder,'Q-1',{option:'A',by:'Business analyst'});
  const s=await stateOf(w),q=s.questions.find(x=>x.id==='Q-1'),d=s.decisions.find(x=>x.question==='Q-1');
  assert.equal(q.status,'answered');assert.equal(d.status,'approved');assert.match(d.evidence,/Business analyst[\s\S]*option A/);
  assert.match(await P.read(w.root,w.folder+'/DECISION-LOG.md'),new RegExp(d.id+' \\(approved\\): Q-1'));
  run=await P.advanceWorkflow(w.root,w.folder);await assertNoSilentStop(w,run,'after Q-1');
  assert.equal(run.next.decision.question,w.state.questions[1].question,'continues to Q-2 without asking to continue');
 });
 await t.test('a custom answer is saved word for word; the next required question follows',async()=>{
  await P.recordAnswer(w.root,w.folder,'Q-2',{option:'custom',custom:'All business units except training units',by:'Business analyst'});
  const q=(await stateOf(w)).questions.find(x=>x.id==='Q-2');assert.equal(q.answer.option,'custom');assert.equal(q.answer.text,'All business units except training units');
  run=await P.advanceWorkflow(w.root,w.folder);await assertNoSilentStop(w,run,'after Q-2');
  assert.equal(run.next.decision.question,w.state.questions[2].question);
 });
 await t.test('Decide later keeps the decision pending, never approved, and explains that it blocks the refined PBI',async()=>{
  await P.recordSkip(w.root,w.folder,'Q-3');
  const s=await stateOf(w);assert.equal(s.questions.find(x=>x.id==='Q-3').status,'deferred');assert.ok(!s.decisions.some(d=>d.question==='Q-3'),'no decision for a deferred question');
  run=await P.advanceWorkflow(w.root,w.folder);await assertNoSilentStop(w,run,'after Decide later');
  assert.equal(run.next.action,'ASK_DECISION');assert.equal(run.next.stage,'PENDING_DECISION');assert.match(run.next.reason,/Q-3[\s\S]*|block/);
  assert.match(run.next.reason,/block the refined PBI: Q-3/);assert.deepEqual(run.next.pending.map(p=>p.id+':'+p.blocking),['Q-3:true']);
  assert.ok(run.next.decision.options.some(o=>o.key==='LATER'));assert.equal(run.report.finalAllowed,false);assert.equal(run.report.computedStatus,'Awaiting PO/BA Decision');
  const raw=await P.read(w.root,w.folder+'/pbi-state.json'),refused=w.ps('-Action','ApproveAndGenerate','-Pbi',w.folder.split('/').pop(),'-Approver','Product owner','-ReviewedContent',run.report.reviewedContent);
  assert.equal(refused.code,2);assert.match(refused.err,/Not ready for approval/);assert.equal(await P.read(w.root,w.folder+'/pbi-state.json'),raw,'nothing is approved while a decision is pending');
  assert.equal(await finalFiles(w),0);
 });
 await t.test('resume keeps the pending decision; answering it reaches the final review instead of stopping at the draft',async()=>{
  run=await P.advanceWorkflow(w.root,w.folder);assert.equal(run.next.stage,'PENDING_DECISION','still pending after resume');
  await P.recordAnswer(w.root,w.folder,'Q-3',{option:'A',by:'Business analyst'});
  run=await P.advanceWorkflow(w.root,w.folder);await assertNoSilentStop(w,run,'all answered');
  assert.equal(run.report.computedStatus,'Ready for Review');assert.equal(run.next.action,'ASK_DECISION');assert.equal(run.next.stage,'FINAL_REVIEW');
  assert.deepEqual(run.next.decision.options.map(o=>o.key),['A','B','C','CUSTOM']);assert.match(run.next.decision.options[2].text,/Decide later/);
  assert.equal(await finalFiles(w),0,'review is not approval');
 });
 await t.test('an explicit approval runs ApproveAndGenerate and creates exactly the target refined PBIs',async()=>{
  const review=await P.checkPbi(w.root,w.folder,true);
  const r=w.ps('-Action','ApproveAndGenerate','-Pbi',w.folder.split('/').pop(),'-Approver','Product owner','-ReviewedContent',review.reviewedContent);
  assert.equal(r.code,0,r.err+r.out);assert.match(r.out,/Approved and generated:[\s\S]*Refined-PBI-CDMS\.md[\s\S]*Refined-PBI-DAB\.md[\s\S]*Refined-PBI-UI\.md/);
  assert.equal(await finalFiles(w),9,'Markdown, JSON and DOCX for CDMS, DAB and the shared UI');
  assert.equal(await P.read(w.root,w.folder+'/REFINED-PBI.md'),null,'no generic document for a CDMS + DAB + UI target');
  const s=await stateOf(w);assert.equal(s.status,'Development-Ready');assert.equal(s.approvals.user.by,'Product owner');
  for(const n of FINAL)assert.equal(JSON.parse(await P.read(w.root,w.folder+'/'+n+'.json')).status,'Development-Ready');
 });
 await t.test('resuming or synchronizing after approval keeps it current (JavaScript and PowerShell)',async()=>{
  run=await P.advanceWorkflow(w.root,w.folder);
  assert.equal(run.report.computedStatus,'Development-Ready',JSON.stringify(run.report.issues));assert.deepEqual(run.report.issues,[]);
  assert.equal(run.next.action,'COMPLETE','an approved PBI with every final file is complete');
  assert.equal((await P.advanceWorkflow(w.root,w.folder)).next.action,'COMPLETE','a second resume stays complete; no repeated verification step or loop question');
  const sync=w.ps('-Action','SyncPbi','-Pbi',w.folder.split('/').pop(),'-RefreshEvidence','-Json');assert.equal(sync.code,0,sync.err);
  const out=JSON.parse(sync.out.trim());assert.equal(out.report.computedStatus,'Development-Ready');assert.deepEqual(out.report.issues,[]);
  assert.deepEqual(out.report,await P.checkPbi(w.root,w.folder),'PowerShell and JavaScript report the same approved PBI');
  assert.equal((await stateOf(w)).approvals.user.status,'approved');
 });
 await t.test('a real change after approval still requires a new approval',async()=>{
  const s=await stateOf(w);s.rules[0].rule+=' within one second';await P.write(w.root,w.folder+'/pbi-state.json',JSON.stringify(s,null,2));
  const r=await P.checkPbi(w.root,w.folder);assert.ok(r.issues.some(i=>i.code==='APPROVAL_STALE'&&i.ref.startsWith('user:')));assert.equal(r.finalAllowed,false);
  const next=await P.advanceWorkflow(w.root,w.folder);
  assert.equal(next.next.stage,'FINAL_REVIEW','the earlier final files never block the renewed review: '+JSON.stringify(next.next.issues||[]));
 });
 await t.test('the changed PBI can be re-approved in chat: earlier final files do not block it and are regenerated with the change',async()=>{
  const pbi=w.folder.split('/').pop();await P.synchronizePbi(w.root,w.folder);
  const review=JSON.parse(w.ps('-Action','CheckPbi','-Pbi',pbi,'-Json').out.trim());assert.equal(review.computedStatus,'Ready for Review');
  const r=w.ps('-Action','ApproveAndGenerate','-Pbi',pbi,'-Approver','Product owner','-ReviewedContent',review.reviewedContent);
  assert.equal(r.code,0,r.err+r.out);assert.match(r.out,/Approved and generated:/);
  const s=await stateOf(w);assert.equal(s.status,'Development-Ready');assert.ok((s.approvalHistory||[]).some(h=>h.scope==='user'&&h.status==='stale'),'the replaced approval is kept');
  for(const n of FINAL)assert.match(await P.read(w.root,w.folder+'/'+n+'.md'),/within one second/,n+' carries the approved change');
  const after=await P.checkPbi(w.root,w.folder);assert.equal(after.computedStatus,'Development-Ready',JSON.stringify(after.issues));
  assert.deepEqual(JSON.parse(w.ps('-Action','CheckPbi','-Pbi',pbi,'-Json').out.trim()),after);
 });
});

test('missing evidence is searched in the configured repositories first; only an unreadable source becomes a named gap, never a business question',async t=>{
 const w=await workspace(t),s=JSON.parse(JSON.stringify(w.state));
 for(const q of s.questions)Object.assign(q,{status:'answered',answer:{option:'A',text:q.options[0].text}});
 s.rules[1].paths.ui={status:'unknown'};
 const readiness={computedStatus:'Needs Evidence',issues:[{code:'PATH_UNKNOWN',ref:'BR-2/ui'}]};
 const readable=P.workflowNextAction({state:s,readiness,sourceMap:{ui:'../UI'},requirementsComplete:true});
 assert.equal(readable.action,'AUTO_VERIFY','a configured repository is searched without asking');assert.deepEqual(readable.work.map(x=>x.rule+'/'+x.application),['BR-2/ui']);
 assert.equal(readable.decision,undefined,'no question for evidence the agent can read');
 const unreadable=P.workflowNextAction({state:{...s,sourceAccess:[{source:'ui',status:'configured-inaccessible',path:'../UI',reason:'Folder not shared with this workspace'}]},readiness,sourceMap:{},requirementsComplete:true});
 assert.equal(unreadable.action,'RECORD_GAP');assert.match(unreadable.next,/exact access failure, affected behavior, owner and verification task/);
 assert.equal(unreadable.decision,undefined,'an inaccessible source is a recorded gap, not a business question');
});

test('Decide later on one question does not block asking the others, and a conditional draft never ends the flow when review is possible',()=>{
 const q=(id,extra={})=>({id,question:'Question '+id,owner:'po-ba',blocking:true,status:'open',options:[{key:'A',text:'Yes'},{key:'B',text:'No'}],...extra});
 const base={pbi:'1',status:'Awaiting PO/BA Decision',rules:[],evidence:[],decisions:[],acceptanceCriteria:[{id:'AC-1'}]};
 const n=P.workflowNextAction({state:{...base,questions:[q('Q1',{status:'deferred'}),q('Q2')]},readiness:{computedStatus:'Awaiting PO/BA Decision',issues:[]}});
 assert.equal(n.decision.question,'Question Q2','the waiting question is asked; the deferred one is not repeated at once');assert.deepEqual(n.pending.map(p=>p.id),['Q1']);
 const nb=P.workflowNextAction({state:{...base,status:'Ready for Review',questions:[q('Q1',{status:'deferred',blocking:false})]},readiness:{computedStatus:'Ready for Review',issues:[{code:'APPROVAL_PENDING',ref:'user'}]}});
 assert.equal(nb.stage,'FINAL_REVIEW','a deferred optional question does not block review');assert.deepEqual(nb.pending,[{id:'Q1',question:'Question Q1',blocking:false}]);
 const cond=P.workflowNextAction({state:{...base,status:'Ready for Review',questions:[],analysis:{conditionalPbiGenerated:true}},readiness:{computedStatus:'Ready for Review',issues:[{code:'APPROVAL_PENDING',ref:'user'}]},requirementsComplete:true});
 assert.equal(cond.stage,'FINAL_REVIEW','a conditional draft whose dependencies are resolved goes to the final review');
 const open=P.workflowNextAction({state:{...base,status:'Needs Evidence',questions:[],analysis:{conditionalPbiGenerated:true}},readiness:{computedStatus:'Needs Evidence',issues:[{code:'EVIDENCE_GAP',ref:'BR-1'}]},
  gaps:[{id:'EXT-1',classification:'EXTERNAL_DEPENDENCY',description:'DAB authorization policy',owner:'DAB security owner',readinessRefs:['BR-1']}],requirementsComplete:true});
 assert.equal(open.action,'REFINEMENT_COMPLETE');assert.equal(open.finalAllowed,false);assert.deepEqual(open.blockers,[{id:'EXT-1',description:'DAB authorization policy',owner:'DAB security owner'}]);
 assert.match(open.next,/refined PBI is not generated yet and do not call the PBI complete/);
 // A WARNING or INFORMATIONAL gap is a warning, never a dependency that holds the PBI at a draft.
 const warn=P.workflowNextAction({state:{...base,status:'Ready for Review',questions:[],rules:[{id:'BR-1',gaps:[{id:'G',description:'Side effect',status:'open',impact:'INFORMATIONAL'}]}]},readiness:{computedStatus:'Ready for Review',issues:[{code:'APPROVAL_PENDING',ref:'user'}]},requirementsComplete:true});
 assert.equal(warn.stage,'FINAL_REVIEW');
});


test('an approval given with 5.3.0 stays current under 5.4 while nothing changed, and a later sync no longer invalidates new approvals',async t=>{
 const V53=require('./fixtures/baseline-v5.3.0-core.cjs'),w=await workspace(t),pbi=w.folder.split('/').pop();
 for(const id of ['Q-1','Q-2','Q-3'])await P.recordAnswer(w.root,w.folder,id,{option:'A',by:'Business analyst'});
 await P.synchronizePbi(w.root,w.folder);
 // Approve exactly as 5.3.0 did (its fingerprint includes the synchronized Readiness lines and pbi.json progress).
 const review53=await V53.checkPbi(w.root,w.folder,true);await V53.approveAndGenerate(w.root,w.folder,'Product owner',review53.reviewedContent);
 const bound=(await stateOf(w)).approvals.user.basis.reviewedContent;
 assert.notEqual(bound,(await P.checkPbi(w.root,w.folder,true)).reviewedContent,'the 5.4 fingerprint differs, so the legacy path is exercised');
 const js=await P.checkPbi(w.root,w.folder);assert.equal(js.computedStatus,'Development-Ready',JSON.stringify(js.issues));
 const ps=JSON.parse(w.ps('-Action','CheckPbi','-Pbi',pbi,'-Json').out.trim());assert.deepEqual(ps,js,'PowerShell accepts the same 5.3-bound approval');
 // Any material change still makes it stale, under both engines.
 const s=await stateOf(w);s.rules[0].rule+=' within one second';await P.write(w.root,w.folder+'/pbi-state.json',JSON.stringify(s,null,2));
 const stale=await P.checkPbi(w.root,w.folder);assert.ok(stale.issues.some(i=>i.code==='APPROVAL_STALE'&&i.ref.startsWith('user:')));
 assert.deepEqual(JSON.parse(w.ps('-Action','CheckPbi','-Pbi',pbi,'-Json').out.trim()),stale);
});
