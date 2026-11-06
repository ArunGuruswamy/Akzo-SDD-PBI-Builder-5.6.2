'use strict';
// 5.3.0: minimum sufficient evidence, analysis plan, incremental source discovery, evidence dependencies and run metrics.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const P=require('./src/core.js'),shared=require('./fixtures/readiness-cases.cjs');
const {DirectoryHandle}=require('./fixtures/fs-handles.cjs');

async function reviewCase(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-530-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=new DirectoryHandle(dir),folder='playbook/pbis/'+shared.PBI;
 const {cases}=await shared.load(P),c=JSON.parse(JSON.stringify(cases.find(x=>x.name==='fully approved PBI may be finalized')));
 const s=c.state;s.status='Ready for Review';s.approvals={poba:{status:'pending'},technical:{status:'pending'},user:{status:'pending'}};
 s.paths={cdms:{applies:true},dab:{applies:false,reason:'Reference only'},ui:{applies:false,reason:'No UI changes'}};for(const r of s.rules)delete r.paths.dab;
 c.docs={...c.docs,draft:c.docs.refined.replace(/^Status:.*$/m,'Status: Ready for Review'),refined:null};
 await shared.writeCase(P,root,folder,c);
 await P.write(root,folder+'/pbi.json',JSON.stringify({title:'Formula status',number:'305965',application:'cdms',repositories:[],description:'Keep Released formulas Released.',acceptanceCriteria:'Released stays Released.'}));
 return {dir,root,folder,c};
}
const writeState=(root,folder,state)=>P.write(root,folder+'/pbi-state.json',JSON.stringify(state,null,2));
function zipEntry(bytes,name){
 const b=Buffer.from(bytes);let pos=0;
 while(pos+30<=b.length&&b.readUInt32LE(pos)===0x04034b50){
  const size=b.readUInt32LE(pos+18),n=b.readUInt16LE(pos+26),extra=b.readUInt16LE(pos+28),start=pos+30+n+extra;
  if(b.toString('utf8',pos+30,pos+30+n)===name)return b.toString('utf8',start,start+size);
  pos=start+size;
 }
 throw Error('Missing ZIP entry: '+name);
}

test('non-blocking gaps reach the approver and every generated format; a BLOCKING gap stops the approval',async t=>{
 const {dir,root,folder,c}=await reviewCase(t);
 const warn='Audit-trail side effect of the old plugin is not verified';
 c.state.rules[0].gaps=[{id:'GAP-1',description:warn,status:'open',impact:'INFORMATIONAL'},{id:'GAP-2',description:'Optional metadata sync is unverified',status:'open',impact:'WARNING'},{id:'GAP-3',description:'Already settled',status:'resolved',impact:'BLOCKING'}];
 await writeState(root,folder,c.state);
 const report=await P.checkPbi(root,folder,true);
 assert.deepEqual(P.approvalBlockers(report),[],'warnings are not blockers');
 assert.deepEqual(report.warnings.map(w=>[w.code,w.ref,w.impact]),[['GAP_OPEN','BR-1/GAP-1','INFORMATIONAL'],['GAP_OPEN','BR-1/GAP-2','WARNING']]);
 assert.deepEqual(P.handoff(c.state,report).readiness.warnings,['GAP_OPEN BR-1/GAP-1','GAP_OPEN BR-1/GAP-2']);
 assert.deepEqual(P.handoff(c.state,report).gaps.map(g=>g.impact),['INFORMATIONAL','WARNING']);
 const done=await P.approveAndGenerate(root,folder,'Reviewer',report.reviewedContent);
 assert.equal(done.check.computedStatus,'Development-Ready');assert.equal(done.check.warnings.length,2);
 const md=await P.read(root,folder+'/Refined-PBI-CDMS.md'),json=JSON.parse(await P.read(root,folder+'/Refined-PBI-CDMS.json')),docx=zipEntry(await fs.readFile(path.join(dir,folder,'Refined-PBI-CDMS.docx')),'word/document.xml');
 const line='BR-1: '+warn+' (informational evidence gap; does not block the PBI)';
 assert.ok(md.includes(line),'Markdown lists the warning');assert.ok(json.openIssues.includes(line),'JSON lists the same warning');
 assert.ok(docx.includes(line),'DOCX lists the same warning');
 assert.ok(md.includes('BR-1: Optional metadata sync is unverified (warning evidence gap; does not block the PBI)'));
 assert.ok(!md.includes('Already settled'),'a resolved gap is not listed');

 // A BLOCKING gap, an unspecified impact, or resolve-gap still blocks; nothing is approved.
 for(const impact of ['BLOCKING',undefined,'LOW']){
  const r=await reviewCase(t);r.c.state.rules[0].gaps=[{id:'GAP-1',description:'Registration unknown',status:'open',...(impact?{impact}:{})}];await writeState(r.root,r.folder,r.c.state);
  const rep=await P.checkPbi(r.root,r.folder,true);assert.ok(rep.issues.some(i=>i.code==='EVIDENCE_GAP'),String(impact));assert.deepEqual(rep.warnings,[]);
  await assert.rejects(P.approveAndGenerate(r.root,r.folder,'Reviewer',rep.reviewedContent),/EVIDENCE_GAP/);
  assert.equal(JSON.parse(await P.read(r.root,r.folder+'/pbi-state.json')).approvals.user.status,'pending');
 }
});

test('ASSUMED and UNAVAILABLE evidence is reported as a warning and never counts as proof',async t=>{
 const {root,folder,c}=await reviewCase(t);
 c.state.evidence.find(e=>e.id==='EV-5').verification='ASSUMED';
 await writeState(root,folder,c.state);
 const report=await P.checkPbi(root,folder,true);
 assert.ok(report.issues.some(i=>i.code==='NO_EVIDENCE'&&i.ref==='BR-2'),'BR-2 has no verified code evidence left');
 assert.deepEqual(report.warnings.map(w=>w.code+' '+w.ref),['EVIDENCE_NOT_VERIFIED BR-2/EV-5']);
 assert.equal(P.handoff(c.state,report).rules.find(r=>r.id==='BR-2').evidence[0].verification,'ASSUMED');
 c.state.evidence.find(e=>e.id==='EV-5').verification='VERIFIED';await writeState(root,folder,c.state);
 assert.equal((await P.checkPbi(root,folder,true)).issues.some(i=>i.code==='NO_EVIDENCE'),false);
});

test('agent entry point routes to the relevant guide only, and every routed guide ships with the package',()=>{
 const assets=JSON.parse(require('node:fs').readFileSync(path.join(__dirname,'src/assets.json'),'utf8'));
 const files=P.setupFiles({projectName:'Router',ide:'vscode',role:'dab',sources:{legacy:'../Legacy',cdms:'../CDMS',ui:'../UI'}},assets,'<html></html>').files;
 const agent=files[P.AGENT],router=agent.slice(agent.indexOf('## Workflow router'),agent.indexOf('## Source access before analysis'));
 assert.ok(router.length>0&&router.length<3500,'the router stays compact ('+router.length+' characters)');
 for(const w of ['Repository configuration','Existing implementation analysis','Legacy CRM intelligence','Business decision advisory','PBI refinement','Approval and generation','Validation and export'])assert.ok(router.includes('- '+w),w);
 const guides=[...new Set([...router.matchAll(/([a-z-]+)\.md/g)].map(m=>m[1]))].filter(n=>files[P.BASE+'/skills/'+n+'.md']!==undefined);
 assert.deepEqual(guides.sort(),['business-rule-branch-completeness','business-rule-ownership','crm-plugin-workflow-intelligence','execution-path-analysis','guided-pbi-creation','readiness-and-approval','repository-knowledge',
  'stage-analysis','stage-approval','stage-artifacts','stage-cross-repo','stage-evidence','stage-intake','stage-questions','stage-resume','xrm-workflow-intelligence']);
 assert.match(router,/Never load every guide for every PBI, introduce roles, show menus or\s+repeat introductions, and never add a per-role approval gate/);
 assert.match(router,/knowledge\/SOURCE-MAP\.md[\s\S]*knowledge\/FILE-INDEX\.txt[\s\S]*knowledge\/evidence-index\.json/);
 assert.match(agent,/## Minimum sufficient evidence[\s\S]*VERIFIED[\s\S]*ASSUMED[\s\S]*UNAVAILABLE[\s\S]*BLOCKING[\s\S]*WARNING[\s\S]*INFORMATIONAL/);
 // Stage detail lives in the modules the router names for that stage; each must ship and be routed.
 const stage=n=>{assert.ok(router.includes('stage-'+n+'.md'),'router names stage-'+n);assert.ok(files[P.BASE+'/skills/stage-'+n+'.md'],'stage-'+n+' ships');return agent+'\n'+files[P.BASE+'/skills/stage-'+n+'.md'];};
 assert.match(stage('cross-repo'),/"Shared UI flow\s+map" section/);assert.match(stage('cross-repo'),/"Implementation difference map"/);assert.match(agent,/"Run metrics" section/);
 assert.match(agent,/tools: \["read", "search", "edit", "execute", "vscode\/askQuestions"\]/);
 const interaction=agent.replace(/\s+/g,' ');
 assert.ok(interaction.includes('tools actually exposed in this session; the configured IDE profile and frontmatter declaration are not proof that a tool is callable. In VS Code, invoke vscode/askQuestions directly as the primary mechanism for every genuine business decision and folder disambiguation when it is exposed.'));
 assert.ok(interaction.includes('Use single-choice by default, multi-select only for genuinely independent selections, and keep free-text/custom answers enabled. Ask one question per call and per message, the earliest unanswered first; never group questions. Do not first print numbered options in chat.'));
 assert.ok(interaction.includes('Only fall back to concise numbered chat choices if the tool is absent from the runtime or the invocation fails; state which happened'));
 assert.ok(interaction.includes('continue automatically to the next analysis or readiness step'));
 assert.ok(interaction.includes('automatically when requirements are defined and only technical evidence, registration, runtime, implementation or external dependencies remain'));
 assert.ok(interaction.includes('Conditional drafts are not final Refined-PBI-CDMS/DAB/UI artifacts and do not bypass approval or readiness'));
 assert.ok(interaction.includes('REQUEST.md and user-entered pbi.json intake fields are preserved. Only workflow-owned pbi.json metadata (wizard stage, sourceAccess and computed status) may be synchronized, after preserving the prior version under history/'));
 assert.ok(interaction.includes('If DRAFT-PBI.md or OPEN-QUESTIONS.md differs, preserve the prior document before correcting only the recoverable mirror'));
 const guided=files[P.BASE+'/skills/guided-pbi-creation.md'].replace(/\s+/g,' ');
 assert.ok(guided.includes('automatically generate a CONDITIONAL draft for EXTERNAL_DEPENDENCY, RUNTIME_VERIFICATION, registration and implementation gaps'));
 assert.ok(guided.includes('Record unresolved dependencies as owner actions in the draft; ask about each one once, never as a reason to stop'));
 assert.ok(guided.includes('Never create final Refined-PBI-CDMS/DAB/UI artifacts or claim implementation readiness from this path'));
 const resolution=stage('resume').replace(/\s+/g,' ');
 assert.ok(resolution.includes('explicitly supplied path takes precedence.'));
 assert.ok(resolution.includes('probe only playbook/pbis and Source/playbook/pbis'));
 assert.ok(resolution.includes('Cache found roots and failed paths'));
 assert.ok(resolution.includes('If the current conversation already resolved this PBI to a folder, reuse that folder after verifying its pbi-state.json identity; do not ask for it again.'));
 assert.ok(resolution.includes('inspect only pbi.json and pbi-state.json to compare identity, status and recorded decisions'));
 assert.ok(resolution.includes('invoke vscode/askQuestions with one clickable choice per folder plus a free-text Custom choice'));
 assert.ok(resolution.includes('Use numbered chat choices only if the native tool is absent or fails.'));
 assert.match(files[P.BASE+'/skills/guided-pbi-creation.md'].replace(/\s+/g,' '),/After recording an answer, continue the current workflow automatically[\s\S]*do not stop at an acknowledgement[\s\S]*copy and paste/);
 assert.match(files['.github/skills/business-decision-advisor/SKILL.md'].replace(/\s+/g,' '),/Then return to the active PBI stage and continue automatically[\s\S]*do not require a separate/);
 assert.match(files[P.BASE+'/skills/readiness-and-approval.md']+'\n'+stage('approval'),/Install-PBIBuilder\.ps1 -RepoPath <repository-root> -Action ApproveAndGenerate\s+-Pbi <folder> -Approver <name>[\s\S]*-ReviewedContent <fingerprint>/);
 assert.match(files[P.BASE+'/README.md'],/review the concise summary in chat[\s\S]*"Approve & Generate"[\s\S]*HTML form remains\s+optional/);
 const vs=P.setupFiles({projectName:'Router',ide:'visualstudio',role:'dab',sources:{legacy:'../Legacy',cdms:'../CDMS',ui:'../UI'}},assets,'<html></html>').files[P.AGENT];
 const vsRouter=vs.slice(vs.indexOf('## Workflow router'),vs.indexOf('## Source access before analysis'));
 assert.ok(vsRouter.length>0&&vsRouter.length<3500,'the Visual Studio router stays compact ('+vsRouter.length+' characters)');
 assert.doesNotMatch(vs,/tools:.*execute/,'do not publish an unsupported command tool for Visual Studio');
 const vsInteraction=vs.replace(/\s+/g,' ');
 assert.ok(vsInteraction.includes('configured IDE profile and frontmatter declaration are not proof that a tool is callable. In VS Code, invoke vscode/askQuestions directly as the primary mechanism for every genuine business decision'));
 assert.ok(vsInteraction.includes('Only fall back to concise numbered chat choices if the tool is absent from the runtime or the invocation fails'));
 assert.match(files[P.BASE+'/skills/readiness-and-approval.md'],/"impact" is BLOCKING[\s\S]*Evidence "verification" is VERIFIED/);
 assert.match(files[P.BASE+'/skills/repository-knowledge.md'],/"dependsOn"[\s\S]*"dependency-changed"[\s\S]*"reusable"/);
});

test('workflow next action continues recoverable work, asks genuine decisions, and preserves conditional/readiness gates',()=>{
 const automatic=P.workflowNextAction({gaps:[{id:'MAP-1',classification:'AUTO_RESOLVABLE'}],autoSteps:0});
 assert.equal(automatic.action,'AUTO_CONTINUE');assert.equal(automatic.stage,'EVIDENCE_RESOLUTION');
 const decision=P.workflowNextAction({state:{questions:[{id:'Q-1',owner:'po-ba',blocking:true,status:'unanswered',question:'Choose a policy'}]}});
 assert.equal(decision.action,'ASK_DECISION');assert.deepEqual(decision.decisions.map(q=>q.id),['Q-1']);
 const technical=P.workflowNextAction({state:{questions:[{id:'Q-T',owner:'technical',blocking:true,status:'unanswered',question:'Confirm the security contract'}]},requirementsComplete:true});
 assert.equal(technical.action,'GENERATE_CONDITIONAL_PBI');assert.ok(technical.gaps.some(g=>g.origin==='technical-question'));assert.equal(technical.decision,undefined);
 const technicalGaps=[
  {id:'EXT-CMS',classification:'EXTERNAL_DEPENDENCY',readinessRefs:['EXT-CMS']},
  {id:'RUN-CRM',classification:'RUNTIME_VERIFICATION',readinessRefs:['RUN-CRM']},
  {id:'EXT-AUDIT',classification:'EXTERNAL_DEPENDENCY',readinessRefs:['EXT-AUDIT']},
  {id:'EXT-INSTRUMENT',classification:'EXTERNAL_DEPENDENCY',readinessRefs:['EXT-INSTRUMENT']},
  {id:'RUN-CONNECTION',classification:'RUNTIME_VERIFICATION',readinessRefs:['RUN-CONNECTION']}];
 const technicalReadiness={computedStatus:'Needs Evidence',issues:technicalGaps.map(g=>({code:'EVIDENCE_GAP',ref:g.id}))};
 const initialState={pbi:'305974',questions:[],decisions:[{id:'DEC-1',status:'approved'},{id:'DEC-2',status:'approved'},{id:'DEC-3',status:'approved'},{id:'DEC-4',status:'approved'},{id:'DEC-5',status:'approved'}]};
 const conditionalQuestion=P.workflowNextAction({state:initialState,readiness:technicalReadiness,gaps:technicalGaps,requirementsComplete:true});
 assert.equal(conditionalQuestion.action,'GENERATE_CONDITIONAL_PBI');assert.equal(conditionalQuestion.gaps.length,5);
 const savedChoice=P.recordWorkflowChoice(initialState,{option:'A',by:'user',at:'2026-11-04T12:00:00Z'});
 const resumedState=JSON.parse(JSON.stringify(savedChoice.state));assert.equal(resumedState.decisions.length,5);assert.equal(resumedState.decisions[4].id,'DEC-5');
 assert.equal(resumedState.analysis.workflowChoices[0].status,'selected');assert.equal(resumedState.analysis.workflowChoices[0].option,'A');
 const custom=P.recordWorkflowChoice(initialState,{option:'D',custom:'Coordinate service verification with the owning team.',by:'user',at:'2026-11-04T12:01:00Z'});
 assert.equal(custom.choice.response,'Coordinate service verification with the owning team.');assert.equal(custom.state.decisions.length,5);
 const conditional=P.workflowNextAction({state:resumedState,readiness:technicalReadiness,gaps:technicalGaps,requirementsComplete:true});
 assert.equal(conditional.action,'GENERATE_CONDITIONAL_PBI');assert.equal(conditional.gaps.length,5);
 const appliedChoice=P.completeWorkflowChoice(resumedState,resumedState.analysis.workflowChoices[0].id,{conditionalPbiGenerated:true,at:'2026-11-04T12:02:00Z'});
 const continuePlan=P.workflowNextAction({state:appliedChoice,readiness:technicalReadiness,gaps:technicalGaps,requirementsComplete:true});
 assert.equal(continuePlan.action,'REFINEMENT_COMPLETE');assert.equal(continuePlan.stage,'REFINEMENT_COMPLETE');
 const conditionalComplete=P.workflowNextAction({state:appliedChoice,readiness:technicalReadiness,gaps:technicalGaps,requirementsComplete:true,implementationPlanComplete:true});
 assert.equal(conditionalComplete.action,'REFINEMENT_COMPLETE');assert.equal(conditionalComplete.conditional,true);assert.equal(conditionalComplete.finalAllowed,false);
 const unlinkedIssue=P.workflowNextAction({readiness:{computedStatus:'Draft',issues:[{code:'DOC_CONTENT_MISMATCH',ref:'BR-2'}]},gaps:[{id:'DEP-1',classification:'EXTERNAL_DEPENDENCY'}],requirementsComplete:true});
 assert.equal(unlinkedIssue.action,'BLOCKED_EXTERNAL');assert.deepEqual(unlinkedIssue.issues.map(i=>i.ref),['BR-2']);
 const incomplete=P.workflowNextAction({readiness:{computedStatus:'Needs Evidence'},gaps:[{id:'DEP-1',classification:'EXTERNAL_DEPENDENCY'}],requirementsComplete:false});
 assert.equal(incomplete.action,'ASK_DECISION');assert.equal(incomplete.stage,'REQUIREMENT_CLARIFICATION');assert.match(incomplete.decision.question,/business outcome or acceptance condition/);
 const unclassified=P.workflowNextAction({gaps:[{id:'G-1',description:'unknown source gap'}],requirementsComplete:true});
 assert.equal(unclassified.action,'GENERATE_CONDITIONAL_PBI');assert.equal(unclassified.gaps[0].sourceClassification,'missing');
 const loop=P.workflowNextAction({recoverableWork:['same document mismatch'],autoSteps:8});
 assert.equal(loop.action,'BLOCKED_EXTERNAL');assert.match(loop.reason,/step limit/);
 const review=P.workflowNextAction({readiness:{computedStatus:'Ready for Review'}});
 assert.equal(review.action,'ASK_DECISION');assert.match(review.next,/explicit user choice/);
 const ready=P.workflowNextAction({readiness:{computedStatus:'Development-Ready'}});
 assert.equal(ready.action,'AUTO_CONTINUE');assert.equal(ready.stage,'PBI_GENERATION');
 const readyWithArtifacts=P.workflowNextAction({readiness:{computedStatus:'Development-Ready'},artifactsAvailable:true});
 assert.equal(readyWithArtifacts.action,'COMPLETE');
 const noReadiness=P.workflowNextAction({requirementsComplete:true});
 assert.equal(noReadiness.action,'VALIDATE');assert.equal(noReadiness.stage,'READINESS_VALIDATION');
 const draftWithoutIssues=P.workflowNextAction({readiness:{computedStatus:'Draft',issues:[]},requirementsComplete:true});
 assert.equal(draftWithoutIssues.action,'BLOCKED_EXTERNAL');assert.equal(draftWithoutIssues.stage,'READINESS_VALIDATION');
});

test('analysis plan scans the shared UI once and only the backend differences per backend',()=>{
 const cfg={sources:{legacy:'../Legacy',cdms:'../CDMS',dab:'../DAB',ui:'../UI'},others:[]};
 const keys=p=>p.passes.map(x=>x.key);
 let p=P.planAnalysis(cfg,'both');
 assert.deepEqual(keys(p),['legacy','ui','cdms','dab']);assert.equal(p.passes.filter(x=>x.key.startsWith('ui')).length,1,'one UI scan for both backends');
 assert.equal(p.ui.shared,true);assert.equal(p.ui.verified,false);assert.match(p.ui.reason,/assumed/);
 assert.deepEqual(p.passes.find(x=>x.key==='cdms').backendChecks,['API URLs','configuration','request and response contracts','authorization','behavior differences']);
 assert.match(p.summary,/Shared Angular UI \(once\)/);
 // Verified identity: both backends integrate the same UI revision.
 p=P.planAnalysis(cfg,'both',{uiIdentity:{cdms:'org/ui@abc',dab:'org/ui@abc'}});assert.equal(p.ui.verified,true);assert.match(p.ui.reason,/analyzed once/);assert.deepEqual(keys(p),['legacy','ui','cdms','dab']);
 // Different identities: the second UI is compared, not rescanned.
 p=P.planAnalysis(cfg,'both',{uiIdentity:{cdms:'org/ui@abc',dab:'org/ui-dab@def'}});assert.equal(p.ui.shared,false);assert.deepEqual(keys(p),['legacy','ui','ui-second','cdms','dab']);assert.equal(p.passes.find(x=>x.key==='ui-second').differencesOnly,true);
 // Every selection keeps its own scope; the DAB target reads CDMS only as a reference.
 p=P.planAnalysis(cfg,'cdms');assert.deepEqual(keys(p),['legacy','ui','cdms']);
 p=P.planAnalysis(cfg,'dab');assert.deepEqual(keys(p),['legacy','ui','cdms','dab']);assert.match(p.passes.find(x=>x.key==='cdms').scope,/^Read-only reference/);assert.match(p.passes.find(x=>x.key==='dab').scope,/^Implementation/);
 p=P.planAnalysis(cfg,'ui');assert.deepEqual(keys(p),['legacy','ui','cdms','dab']);assert.ok(p.passes.filter(x=>x.key==='cdms'||x.key==='dab').every(x=>/^Read-only reference/.test(x.scope)));
 // Missing configuration is skipped with a reason instead of being guessed; access results are carried through.
 p=P.planAnalysis({sources:{legacy:'',cdms:'../CDMS',dab:'',ui:''},others:[]},'both',{access:{cdms:'readable'}});
 assert.deepEqual(keys(p),['cdms']);assert.deepEqual(p.skipped.map(x=>x.key),['legacy','dab','ui']);assert.equal(p.areas.find(a=>a.key==='cdms').status,'readable');assert.equal(p.ui,null);
 assert.deepEqual(P.planAnalysis(cfg,'unsure').passes,[]);
});

test('Create PBI records the analysis plan once in the request, REQUEST.md and the start prompt',()=>{
 const cfg=P.normalizeConfig({projectName:'Plan',ide:'vscode',role:'legacy',sources:{cdms:'../CDMS',dab:'../DAB',ui:'../UI'}});
 const r=P.newPbi(cfg,{title:'Take measurement',description:'Measure a color.',application:'both',legacy:'legacy'});
 assert.deepEqual(r.request.analysisPlan.passes.map(x=>x.key),['legacy','ui','cdms','dab']);assert.equal(r.request.analysisPlan.ui.shared,true);
 assert.match(r.files[r.folder+'/REQUEST.md'],/## Analysis plan\n\n1\. Custom \(Legacy CRM\/XRM\)[\s\S]*Shared Angular UI \(once\)/);
 assert.match(r.prompt,/Analysis plan \(each scan once;/);
 const unsure=P.newPbi(cfg,{title:'Unknown target',description:'Something.'});assert.ok(!/## Analysis plan/.test(unsure.files[unsure.folder+'/REQUEST.md']));assert.ok(!/Analysis plan/.test(unsure.prompt));
});

test('evidence entries are reused until their file or a dependency changes, and reading is counted',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-530-ev-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=new DirectoryHandle(dir);
 for(const [n,x] of Object.entries({'src/Handler.cs':'class Handler {}','src/Contract.cs':'interface IContract {}','src/Other.cs':'class Other {}'}))await P.write(root,n,x);
 await P.write(root,P.KNOWLEDGE,JSON.stringify({schemaVersion:1,entries:[{id:'K-1',path:'src/Handler.cs',dependsOn:['src/Contract.cs'],repository:'cdms',revision:'main abc'},{id:'K-2',path:'src/Other.cs',dependsOn:['src/Contract.cs']},{id:'K-3',path:'src/Other.cs'},{id:'K-4',path:'../elsewhere/X.cs',revision:'main def'}]}));
 let run=await P.measure(()=>P.refreshEvidence(root));
 assert.deepEqual(run.result.fingerprinted,['K-1','K-2','K-3']);assert.deepEqual(run.result.reusable,['K-1','K-2','K-3']);assert.deepEqual(run.result.skipped,['K-4']);
 // Three local paths are read once each even though four entries cite them.
 assert.equal(run.metrics.distinctFiles,4);assert.equal(run.metrics.repeatedOpens,0,'no file is opened twice in one refresh');
 const readsFirst=run.metrics.fileOpens;
 run=await P.measure(()=>P.refreshEvidence(root));assert.equal(run.result.written,false);assert.equal(run.metrics.writes,0);assert.deepEqual(run.result.reusable,['K-1','K-2','K-3']);
 await P.write(root,'src/Contract.cs','interface IContract { int Added(); }');
 run=await P.measure(()=>P.refreshEvidence(root));assert.deepEqual(run.result.stale,['K-1','K-2']);assert.deepEqual(run.result.reusable,['K-3']);
 const saved=JSON.parse(await P.read(root,P.KNOWLEDGE)).entries;assert.equal(saved[0].staleReason,'dependency-changed');assert.equal(saved[0].repository,'cdms');assert.equal(saved[0].revision,'main abc','recorded identity is kept');
 // The agent re-verifies and clears the flag: the finding is reusable again until something else changes.
 for(const e of saved){delete e.stale;delete e.staleReason;}await P.write(root,P.KNOWLEDGE,JSON.stringify({schemaVersion:1,entries:saved}));
 run=await P.measure(()=>P.refreshEvidence(root));assert.deepEqual(run.result.stale,[]);assert.deepEqual(run.result.reusable,['K-1','K-2','K-3']);
 assert.equal(readsFirst,4,'first run opened the index and each distinct file once');
});

test('the run meter counts opens, repeated opens, bytes and skipped writes without leaking between runs',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-530-m-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=new DirectoryHandle(dir);await P.write(root,'a.txt','12345');
 const outer=await P.measure(async()=>{
  await P.read(root,'a.txt');await P.read(root,'a.txt');await P.read(root,'missing.txt');
  assert.equal(await P.writeIfChanged(root,'a.txt','12345'),false);assert.equal(await P.writeIfChanged(root,'a.txt','123456'),true);
  const inner=await P.measure(()=>P.read(root,'a.txt'));assert.equal(inner.metrics.fileOpens,1);
  return 'done';});
 assert.equal(outer.result,'done');
 const m=outer.metrics;
 assert.equal(m.distinctFiles,2);assert.equal(m.missingOpens,1);assert.ok(m.repeatedOpens>=2);assert.equal(m.skippedWrites,1);assert.equal(m.writes,1);assert.equal(m.bytesWritten,6);assert.equal(m.bytesRead,20,'bytes are counted when a body is read: two reads and the two comparisons made by writeIfChanged, 5 bytes each; the inner run is counted separately');
 assert.equal(typeof m.elapsedMs,'number');assert.equal(Object.keys(m).some(k=>typeof m[k]==='function'),false);
 const after=await P.measure(async()=>{});assert.equal(after.metrics.fileOpens,0,'a finished run leaves no counters behind');
});

test('repository identity is read from .git without credentials, and discovery records entry points and the file index',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-530-g-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=new DirectoryHandle(dir),sha='a'.repeat(40);
 await fs.mkdir(path.join(dir,'.git/refs/heads/feature'),{recursive:true});
 await fs.writeFile(path.join(dir,'.git/HEAD'),'ref: refs/heads/feature/take-measurement\n');await fs.writeFile(path.join(dir,'.git/refs/heads/feature/take-measurement'),sha+'\n');
 await fs.writeFile(path.join(dir,'.git/config'),'[core]\n\tbare = false\n[remote "origin"]\n\turl = https://user:secret-token@example.com/org/repo.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n');
 assert.deepEqual(await P.gitIdentity(root),{branch:'feature/take-measurement',commit:sha,remote:'https://example.com/org/repo.git'});
 await fs.writeFile(path.join(dir,'.git/HEAD'),'b'.repeat(40));assert.equal((await P.gitIdentity(root)).branch,null);assert.equal((await P.gitIdentity(root)).commit,'b'.repeat(40));
 for(const [n,x] of Object.entries({'Api/Program.cs':'class Program {}','Api/Api.csproj':'<Project Sdk="Microsoft.NET.Sdk"/>','Ui/src/app/app.module.ts':'export class M {}','Ui/src/environments/environment.ts':'export const e={}','Ui/node_modules/x/index.js':'x','Ui/package-lock.json':'{}','Ui/appsettings.json':'{}'}))await P.write(root,n,x);
 const map=await P.discoverSources(root,{sources:{legacy:'Api'}});
 assert.equal(map.repository.commit,'b'.repeat(40));assert.deepEqual(map.entryPoints,['Api/Program.cs','Ui/appsettings.json','Ui/src/app/app.module.ts']);
 const index=(await P.read(root,P.FILE_INDEX)).trim().split('\n');assert.deepEqual(index,['Api/Program.cs','Ui/appsettings.json','Ui/src/app/app.module.ts','Ui/src/environments/environment.ts']);
 assert.ok(!JSON.stringify(map).includes('secret-token'),'credentials never reach the map');assert.match(await P.read(root,P.BASE+'/knowledge/SOURCE-MAP.md'),/Branch \(detached\), commit b{40}/);
});
