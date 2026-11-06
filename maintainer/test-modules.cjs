'use strict';
// PBI-A: always-on agent file plus on-demand stage modules. Proves nothing was lost against the frozen pre-split
// agent, that always-on rules stay in the agent file, and that every module ships, is routed and installs cleanly.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const P=require('./src/core.js'),{DirectoryHandle}=require('./fixtures/fs-handles.cjs');
const assets=JSON.parse(require('node:fs').readFileSync(path.join(__dirname,'src/assets.json'),'utf8'));
const BASELINE=JSON.parse(require('node:fs').readFileSync(path.join(__dirname,'fixtures/baseline-v5.3.0-agents.json'),'utf8'));
const STAGES=['intake','resume','analysis','cross-repo','evidence','questions','approval','artifacts'];
const norm=s=>s.replace(/\s+/g,' ').trim();
const sentences=t=>norm(t.replace(/^---[\s\S]*?\n---\n/,'')).split(/(?<=[.!?:])\s+(?=[A-Z0-9"(\-])|\s(?=- )|\s(?=#+ )/).map(s=>s.trim()).filter(s=>s.length>3);
const filesFor=ide=>P.setupFiles({...BASELINE.config,ide},assets,'<html></html>').files;
const modulePath=n=>P.BASE+'/skills/stage-'+n+'.md';
const routerOf=a=>a.slice(a.indexOf('## Workflow router'),a.indexOf('## Source access before analysis'));
// 5.5.0 renamed the final documents to Refined-PBI-CDMS/DAB/UI.md; the baseline is compared under the new names.
const renamedDocs=t=>t.replace(/(?<![-\w])PBI-(CDMS|DAB|UI)(?=[./ ,;:)\n])/g,'Refined-$&');
// 5.6.0 replaced the four fixed development targets (CDMS + UI, DAB + UI, UI Only, Both) with CDMS, DAB and the Shared Angular UI
// chosen independently. These baseline sentences described the fixed targets; the new model is checked under 'independent targets'.
const FIXED_TARGET_TEXT=new Set(['"Select Legacy Source Repository" (the configured legacy repository or another configured one), then "Which project are you developing the PBI for?" with exactly these single-choice options:',
 'CDMS + UI; 2.','DAB + UI; 3.','UI Only; 4.','Both (CDMS + DAB + UI).','Deliverables:','No DAB work.','No backend implementation work.','Refined-PBI-UI.md.','Never modify CDMS or plan CDMS work.',
 '## Development targets pbi.json application is the development target; pbi.json repositories lists each repository with its role.',
 '- CDMS + UI (cdms): analyze Legacy → CDMS → Shared Angular UI.','- DAB + UI (dab): analyze Legacy → CDMS → DAB → Shared Angular UI.','- Both (both): analyze Legacy → CDMS → DAB → Shared Angular UI.',
 'Existing legacy behavior, existing CDMS implementation, missing CDMS functionality, existing UI, required backend and UI changes, API dependencies, validation and tests.',
 'Refined-PBI-CDMS.md, with the applicable shared UI work in a clearly owned "Shared Angular UI" section.','Refined-PBI-DAB.md with verified CDMS references and the applicable shared UI section.',
 'Always inspect CDMS as an implementation reference, even though only DAB was chosen: what CDMS already implements, differences between CDMS and DAB, reusable business logic, backend API integration differences.',
 '- UI Only (ui): analyze Legacy → the relevant CDMS and DAB contracts → Shared Angular UI: components, routes and guards, services and API clients, forms and validation, reusable controls.',
 'Refined-PBI-CDMS.md (CDMS backend), Refined-PBI-DAB.md (DAB backend) and Refined-PBI-UI.md (shared UI, once).',
 'Both backend PBIs reference Refined-PBI-UI.md and keep their own API contracts, validation rules and dependencies; never put the UI work in both.',
 'Record each target as a path in pbi-state.json (paths.cdms, paths.dab, paths.ui) and every path the target excludes as applies false with a reason.',
 'When the requirement explicitly excludes UI changes, keep that decision: paths.ui applies false with the quoted requirement as reason; the UI repository may still be read as a reference.',
 'CDMS + UI cdms and ui; DAB + UI dab and ui; UI Only ui; Both cdms, dab and ui; no target cdms and dab.','Then "Which project are you developing the PBI for?", single choice:',
 '## Application selection The development target (pbi.json application) is CDMS + UI, DAB + UI, UI Only or Both; the wizard asks for it.',
 'CDMS + UI: only Refined-PBI-CDMS.md, with its shared UI section.','DAB + UI: only Refined-PBI-DAB.md, with its verified CDMS references and shared UI section.','UI Only: only Refined-PBI-UI.md.','Both:',
 'Refined-PBI-CDMS.md, Refined-PBI-DAB.md and one Refined-PBI-UI.md; the UI work appears once, in Refined-PBI-UI.md, and both backend PBIs reference it.']);
const isSubsequence=(small,big)=>{let i=0;for(const w of big)if(w===small[i])i++;return i===small.length;};

test('no instruction of the pre-split agent is lost: every sentence is in the agent file or a stage module',()=>{
 for(const ide of ['vscode','visualstudio']){
  const f=filesFor(ide),agent=f[P.AGENT],pool=norm([agent,...STAGES.map(n=>f[modulePath(n)])].join('\n'));
  // Deliberate rewordings, each checked in its new form: a conditional draft is presented as an outcome, never as completion.
  const REWORDED={'Present completion without waiting for dependency owners; never imply final approval or implementation readiness without the check.':
   'Present the outcome without waiting for dependency owners; never imply final approval or implementation readiness without the check.',
   // 5.5.0: business questions are asked one at a time, never grouped.
   'Done when only unresolved decisions were asked, together, and the answers are in pbi-state.json and DECISION-LOG.md.':'Done when only unresolved decisions were asked, one at a time, and the answers are in pbi-state.json and DECISION-LOG.md.',
   'After analysis, present all remaining questions together in one consolidated decision review, not one message per question.':'After analysis, ask the remaining questions one at a time, the earliest unanswered first, each on its own, never grouped.',
   'Use vscode/askQuestions when available; otherwise present the consolidated review in chat.':'Use vscode/askQuestions with one question per call when available; otherwise ask the same single question in chat.'};
  for(const [was,now] of Object.entries(REWORDED))assert.ok(pool.includes(now),ide+': reworded sentence present: '+now);
  const old=sentences(renamedDocs(BASELINE.agents[ide]).replace('# Akzo SDD PBI Builder v5.3.0','# Akzo SDD PBI Builder v'+P.VERSION)),missing=old.filter(s=>!pool.includes(s)&&!REWORDED[s]&&!FIXED_TARGET_TEXT.has(s));
  assert.ok(old.length>380,ide+' baseline parsed into sentences');
  // Only router lines may change, and only by adding words (module names): each old line is a word subsequence of a new one.
  const routerLines=routerOf(agent).split(/\n(?=- )/).map(norm);
  for(const s of missing){
   assert.ok(s.startsWith('- '),ide+': a non-router sentence was lost: '+s);
   const w=s.split(' '),target=routerLines.find(l=>l.startsWith(w.slice(0,4).join(' ')));
   assert.ok(target&&isSubsequence(w,target.split(' ')),ide+': router line changed by more than insertion: '+s);
  }
  assert.ok(missing.length<=4,ide+': only the four extended router lines differ ('+missing.length+')');
 }
});

test('no instruction of the pre-split guides is lost: each sentence stays in its guide or moved to a stage module',()=>{
 const f=filesFor('vscode'),stages=norm(STAGES.map(n=>f[modulePath(n)]).join('\n'));
 // The only rewording: a cross-reference that named the agent now names the module holding that section.
 const renamed=s=>s.replace(`(the agent's "Development targets")`,'("Development targets" in stage-cross-repo.md)')
  .replace('DAB + UI always reads CDMS as a read-only implementation reference','DAB always reads CDMS as a read-only implementation reference')
  // 5.5.0: CDMS + UI also produces Refined-PBI-UI.md; the earlier names are explained; questions one at a time; a conditional draft continues with its blockers.
  .replace('Before 4.1 Refined-PBI-CDMS.md and Refined-PBI-DAB.md were called CDMS-REFINED-PBI.md and DAB-REFINED-PBI.md; existing ones are still read.','Before 5.5 they were called PBI-CDMS.md, PBI-DAB.md and PBI-UI.md, and before 4.1 CDMS-REFINED-PBI.md and DAB-REFINED-PBI.md; existing ones are still read and stay complete until the next approval regenerates them under the current names.')
  .replace('DRAFT-PBI.md remains the working document; with a single application','DRAFT-PBI.md remains the working document and is never presented as the deliverable; with a single application')
  .replace('- After analysis, save unresolved questions together in canonical state and ask them together in Copilot Chat.','- After analysis, save unresolved questions in canonical state and ask them one at a time in Copilot Chat.')
  .replace('rerun readiness, and report refinement complete.','rerun readiness, and resolve the open blockers one at a time as the agent\'s "Never stop at the draft" says.')
  .replace('Present unresolved dependencies as owner actions in the generated artifacts, not as a question blocking refinement.','Record unresolved dependencies as owner actions in the draft; ask about each one once, never as a reason to stop.')
  .replace('- Finish investigating first, then present every remaining decision together in one consolidated decision review, each question in the format below.','- Finish investigating first, then ask the remaining decisions one at a time, the earliest unanswered first, each question in the format below.')
  .replace('Show every independent unresolved decision together after investigation;','Ask the unresolved decisions one at a time after investigation;');
 let moved=0;
 for(const [p,text] of Object.entries(BASELINE.guides)){
  assert.ok(f[p],p+' still ships');const own=norm(f[p]);
  for(const s of sentences(renamedDocs(text))){
   if(own.includes(s)||own.includes(renamed(s))||FIXED_TARGET_TEXT.has(s))continue;
   if(stages.includes(s)){moved++;continue;}
   const w=s.split(' '),inserted=[f[p],...STAGES.map(n=>f[modulePath(n)])].flatMap(sentences).some(n=>n.startsWith(w.slice(0,3).join(' '))&&isSubsequence(w,n.split(' ')));
   if(inserted)continue;
   assert.fail(p+': sentence neither kept nor moved to a stage module: '+s);
  }
 }
 assert.ok(moved>0,'some guide text moved to stage modules');
});

test('always-on rules stay in the agent file itself, in both profiles',()=>{
 const required={
  identity:['name: "Akzo SDD PBI Builder - Baseline"','# Akzo SDD PBI Builder v'+P.VERSION],
  routing:['## Workflow router','Read a listed module before its step, once per conversation, reuse it while unchanged, and never apply its rules from memory'],
  'repository access':['Verify actual file access before claiming it','Never call an inaccessible repository missing','never ask for a path that is configured and readable'],
  accuracy:['## Accuracy and evidence integrity','never fill the gap with an assumption','Never invent an application, repository or dependency','Give file paths, class and method names and line numbers for every claim'],
  'evidence integrity':['Only VERIFIED evidence proves a claim','Keep four evidence levels apart','Plugin source alone does not prove a rule is active','Never treat truncated search results as proof that a rule is absent'],
  'decision persistence':['A clear selection or custom answer approves that one decision','Preserve approved decisions','Never silently rewrite an approval','pbi-state.json is authoritative','do not challenge it again'],
  'approval boundaries':['Wait for an explicit approval before recording it or generating final documents','Never infer approval from silence','Never claim Development-Ready while the check reports a blocker','Never ask for separate PO/BA, technical or per-document approvals','Do not claim completion until the generated files exist'],
  safety:['## Untrusted content','Never write a secret into any document','Never copy secrets or sensitive files','Do not change application code','Reference repositories are read-only'],
  'automatic continuation':['continue automatically to the next analysis or readiness step','Never ask permission to continue routine refinement',"none of them needs the user's confirmation",'keep going without asking permission'],
  'question gate':['CanContinue = every mandatory question (blocking, owner po-ba) is explicitly answered','Moving between questions (Next, Previous, closing or skipping in a question tool) answers nothing','a recommendation is never an answer','never write answers into pbi-state.json or DECISION-LOG.md by hand','While canContinue is false','When canContinue becomes true, continue automatically to readiness'],
  'checker and gaps':['is playbook/pbi-builder/tools/Install-PBIBuilder.ps1 in this repository','never search the disk for another copy','When the host exposes no command tool (Visual Studio), give the user that exact command','Code the PBI asks developers to build is an implementation gap, not missing evidence'],
  'chat flow':['Every question offers the recommended option when evidence supports it, the alternatives, Custom Response and Decide later','never treat an unanswered or deferred question as approved','Decide later keeps a question pending, never approved','A draft is not the refined PBI','When the check reports Ready for Review, present the review and request the final approval instead','After an explicit Approve & Generate, run ApproveAndGenerate at once without asking again','what remains and what blocks refinement','ask once and name exactly what is needed'],
  'never stop at the draft':['## Never stop at the draft','The deliverable is the Refined PBI; DRAFT-PBI.md is only the working draft','ask the user one specific question about it','Never end a turn on the draft or on Needs Evidence','work developers must do because the functionality is not built yet','a runtime or integration check: acceptance criteria and test scenarios','CanRefine = every mandatory question explicitly answered, the required evidence validated and the final approval granted','Never rename a draft into a Refined PBI','An interrupted session resumes at the next unresolved step'],
  'independent targets':['changes in an area that is not a selected target: a dependency plus one scope question','(add it with SetTargets, or keep it out); never its document'],
  'one question at a time':['Ask one question per call and per message','never group questions','Intake, Source Analysis, Questions, Refinement Review, Approval, Refined PBI and COMPLETE','never repeat unchanged progress'],
  'chat first':['Keep the workflow in this conversation','the HTML form is an optional alternative','do not redirect routine refinement to HTML'],
 };
 for(const ide of ['vscode','visualstudio']){
  const agent=norm(filesFor(ide)[P.AGENT]);
  for(const [category,phrases] of Object.entries(required))for(const p of phrases)assert.ok(agent.includes(p),ide+' '+category+': '+p);
 }
});

test('every stage module ships, is routed, carries the load rule and is identical in both profiles',()=>{
 const code=filesFor('vscode'),vs=filesFor('visualstudio');
 for(const f of [code,vs]){
  const shipped=Object.keys(f).filter(p=>/\/skills\/stage-[a-z-]+\.md$/.test(p)).map(p=>p.match(/stage-([a-z-]+)\.md$/)[1]).sort();
  assert.deepEqual(shipped,[...STAGES].sort());
  const router=routerOf(f[P.AGENT]),routed=[...new Set([...router.matchAll(/stage-([a-z-]+)\.md/g)].map(m=>m[1]))].sort();
  assert.deepEqual(routed,[...STAGES].sort(),'the router names every module and no other');
  assert.ok(router.length<3500,'router stays compact');
  for(const n of STAGES){
   const m=f[modulePath(n)];
   assert.match(m,/^# Module: /);assert.match(norm(m),/once per conversation, and reuse it while unchanged\. The agent file's rules always apply/);
   assert.doesNotMatch(m,/\{\{PBI:|\$\{/,'no unresolved placeholder in '+n);
  }
 }
 for(const n of STAGES)assert.equal(code[modulePath(n)],vs[modulePath(n)],'stage-'+n+' is the same for both IDEs');
 // The two agent files differ only in the host-specific tool list and interaction line.
 const strip=a=>a.replace(/^tools: .*$/m,'').replace(/^(VS Code|Visual Studio) profile: .*$/m,'');
 assert.equal(strip(code[P.AGENT]),strip(vs[P.AGENT]));
});

test('each stage loads the module that holds its rules',()=>{
 const f=filesFor('vscode'),agent=f[P.AGENT],router=norm(routerOf(agent)),bullet=w=>router.slice(router.indexOf('- '+w)).split(' - ')[0];
 assert.match(bullet('Existing implementation analysis'),/stage-intake\.md \(Start\) or stage-resume\.md \(Resume, Refine\)[\s\S]*stage-analysis\.md, stage-evidence\.md, stage-cross-repo\.md/);
 assert.match(bullet('Business decision advisory'),/stage-questions\.md/);
 assert.match(bullet('PBI refinement'),/stage-evidence\.md/);
 assert.match(bullet('Legacy CRM intelligence'),/stage-evidence\.md/);
 assert.match(bullet('Approval and generation'),/stage-approval\.md/);
 assert.match(router,/Read stage-resume\.md before resolving an existing PBI folder for any command, and stage-artifacts\.md before the first PBI document write/);
 const has=(n,re)=>assert.match(norm(f[modulePath(n)]),re,'stage-'+n);
 has('intake',/## Start a PBI: one compact intake[\s\S]*"Which project are you developing the PBI for\?"/);
 has('resume',/Cache found roots and failed paths[\s\S]*schemaVersion 1 came from 3\.0\.0/);
 has('analysis',/## Analyze the legacy source directly[\s\S]*## Analysis modes/);
 has('cross-repo',/the user selects CDMS, DAB and the Shared Angular UI independently, any of the seven non-empty combinations[\s\S]*The UI is always optional: selecting CDMS or DAB never brings in the UI, and selecting the UI never brings in a backend[\s\S]*An area that is not selected is never an implementation target and never gets a document[\s\S]*-Action SetTargets/);
 has('intake',/one multi-select question with exactly three independent options: CDMS, DAB and Shared Angular UI/);
 has('cross-repo',/## Development targets[\s\S]*## Shared Angular UI[\s\S]*## Legacy to CDMS to DAB mapping[\s\S]*## Multi-repository implementation analysis/);
 has('evidence',/## Investigate before asking[\s\S]*CONFIRMED \(with source\), INFERRED, UNKNOWN or NEEDS PO\/BA CONFIRMATION/);
 has('questions',/ask the remaining questions one at a time, the earliest unanswered first/);
 has('approval',/1\. Approve & Generate; 2\. Request Changes; 3\. Save Draft/);
 has('artifacts',/## Save the PBI[\s\S]*- pbi-state\.json:/);
 // The start prompt and guides that cite a moved section name the module that now holds it.
 const made=P.newPbi(P.normalizeConfig({...BASELINE.config,ide:'vscode'}),{number:'M1',title:'Modules',description:'d',application:'dab',legacy:'legacy'});
 assert.match(made.files[made.folder+'/START-PROMPT.txt'],/"Analysis modes" in playbook\/pbi-builder\/skills\/stage-analysis\.md/);
 assert.match(f[P.BASE+'/skills/business-rule-ownership.md'],/"Development targets" in stage-cross-repo\.md/);
});

test('upgrade from the single-file agent adds the modules without conflicts, keeps PBI data, and uninstall removes them',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-modules-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=new DirectoryHandle(dir),pbi='playbook/pbis/42-keep/pbi-state.json';
 const OLD=require('./fixtures/baseline-v5.3.0-agents.json');
 // Installed 5.3.0 state before the split: same files except the agent text and no modules.
 const now=filesFor('vscode'),before={...now,[P.AGENT]:OLD.agents.vscode};for(const n of STAGES)delete before[modulePath(n)];
 await P.apply(root,await P.plan(root,before,true),true);await P.write(root,pbi,'{"keep":true}');
 const rows=await P.plan(root,now,true);
 assert.ok(!rows.some(r=>/conflict/.test(r.state)),'no conflicts');
 assert.deepEqual(rows.filter(r=>r.state==='create').map(r=>r.path).sort(),STAGES.map(modulePath).sort());
 assert.equal(rows.find(r=>r.path===P.AGENT).state,'update');
 await P.apply(root,rows,true);
 for(const n of STAGES)assert.equal(await P.read(root,modulePath(n)),now[modulePath(n)]);
 assert.equal(await P.read(root,pbi),'{"keep":true}');
 const manifest=JSON.parse(await P.read(root,P.MANIFEST));
 for(const n of STAGES)assert.ok(JSON.stringify(manifest).includes(modulePath(n)),'manifest owns stage-'+n);
 await P.uninstall(root,await P.uninstallPlan(root));
 for(const n of STAGES)assert.equal(await P.read(root,modulePath(n)),null);
 assert.equal(await P.read(root,pbi),'{"keep":true}');
});
