'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const P=require('./src/core.js'),shared=require('./fixtures/readiness-cases.cjs');
const {DirectoryHandle,FileHandle}=require('./fixtures/fs-handles.cjs');

async function reviewCase(t,target='cdms'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-521-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=new DirectoryHandle(dir),folder='playbook/pbis/'+shared.PBI;
 const {cases}=await shared.load(P),c=JSON.parse(JSON.stringify(cases.find(x=>x.name==='fully approved PBI may be finalized')));
 const s=c.state,no=reason=>({applies:false,reason});
 s.status='Ready for Review';s.approvals={poba:{status:'pending'},technical:{status:'pending'},user:{status:'pending'}};
 if(target==='cdms'){s.paths={cdms:{applies:true},dab:no('Reference only'),ui:no('No UI changes')};for(const r of s.rules)delete r.paths.dab;}
 if(target==='ui'){s.paths={ui:{applies:true},cdms:no('Reference only'),dab:no('Reference only')};for(const r of s.rules)r.paths={ui:{status:'reaches',evidence:['EV-6']}};}
 if(target==='both'){s.paths={cdms:{applies:true},dab:{applies:true},ui:{applies:true}};for(const r of s.rules)r.paths.ui={status:'reaches',evidence:['EV-6']};}
 c.docs={...c.docs,draft:c.docs.refined.replace(/^Status:.*$/m,'Status: Ready for Review'),refined:null};
 await shared.writeCase(P,root,folder,c);
 await P.write(root,folder+'/pbi.json',JSON.stringify({title:'Formula status',number:'305965',application:target,repositories:[],description:'Keep Released formulas Released.',acceptanceCriteria:'Released stays Released.'}));
 return {dir,root,folder,c};
}
async function writeState(root,folder,state){await P.write(root,folder+'/pbi-state.json',JSON.stringify(state,null,2));}
const issues=(report,code)=>report.issues.filter(i=>i.code===code).map(i=>i.ref);
const branch=(coverage,evidence=[])=>({id:'BR-1.Y',condition:'User chooses Yes',expected:'The change is applied',...coverage,evidence,acceptance:['AC-1']});
const codeEvidence=(id,system,component)=>({id,level:'code',kind:'external',source:'../'+system+'/src/Branch.cs',location:'Handle, lines 3-9',revision:'main abc123',summary:'The branch is handled here',system,component});
function zipEntry(bytes,name){
 const b=Buffer.from(bytes);let pos=0;
 while(pos+30<=b.length&&b.readUInt32LE(pos)===0x04034b50){
  const size=b.readUInt32LE(pos+18),n=b.readUInt16LE(pos+26),extra=b.readUInt16LE(pos+28),start=pos+30+n+extra;
  assert.equal(b.readUInt16LE(pos+8),0,'DOCX entries use STORE compression');
  if(b.toString('utf8',pos+30,pos+30+n)===name)return b.toString('utf8',start,start+size);
  pos=start+size;
 }
 throw Error('Missing ZIP entry: '+name);
}
const xml=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

test('review snapshot rejects edits, deletion and recreation of local evidence sources',async t=>{
 const {dir,root,folder}=await reviewCase(t),source='src/Plugins/FormulaStatusPlugin.cs';
 const original=await P.read(root,source),review=await P.checkPbi(root,folder,true);
 assert.deepEqual(P.approvalBlockers(review),[]);
 await P.write(root,source,original+'// changed after review\n');
 assert.notEqual(await P.reviewFingerprint(root,folder),review.reviewedContent);
 await assert.rejects(P.approveAndGenerate(root,folder,'Reviewer',review.reviewedContent),/changed after review/i);
 assert.equal(JSON.parse(await P.read(root,folder+'/pbi-state.json')).approvals.user.status,'pending');
 await P.write(root,source,original);assert.equal(await P.reviewFingerprint(root,folder),review.reviewedContent);
 await fs.unlink(path.join(dir,source));assert.notEqual(await P.reviewFingerprint(root,folder),review.reviewedContent);
 await P.write(root,source,original);assert.equal(await P.reviewFingerprint(root,folder),review.reviewedContent);
});

test('a local evidence path named __proto__ is hashed and checked as an own property',async t=>{
 const {root,folder,c}=await reviewCase(t);
 await P.write(root,'__proto__','original evidence');
 c.state.evidence.push({id:'EV-PROTO',level:'code',kind:'repo-file',source:'__proto__',location:'rule',summary:'Local implementation'});
 await writeState(root,folder,c.state);
 const report=await P.checkPbi(root,folder,true),before=report.reviewedContent;
 assert.ok(!issues(report,'EVIDENCE_SOURCE_MISSING').includes('EV-PROTO'));
 await P.write(root,'__proto__','changed evidence');
 assert.notEqual(await P.reviewFingerprint(root,folder),before);
});

test('an approved PBI becomes stale when a local evidence source or recorded external revision changes',async t=>{
 const {root,folder}=await reviewCase(t),before=await P.checkPbi(root,folder,true);
 await P.approveAndGenerate(root,folder,'Reviewer',before.reviewedContent);
 const original=await P.read(root,'src/Plugins/FormulaStatusPlugin.cs');
 await P.write(root,'src/Plugins/FormulaStatusPlugin.cs','changed source content');
 let report=await P.checkPbi(root,folder,true);
 assert.ok(issues(report,'APPROVAL_STALE').some(x=>x.startsWith('user:')));
 await P.write(root,'src/Plugins/FormulaStatusPlugin.cs',original);
 report=await P.checkPbi(root,folder,true);assert.deepEqual(issues(report,'APPROVAL_STALE'),[]);
 const state=JSON.parse(await P.read(root,folder+'/pbi-state.json'));
 state.evidence.find(e=>e.kind==='external').revision='new reviewed revision';
 await writeState(root,folder,state);report=await P.checkPbi(root,folder,true);
 assert.ok(issues(report,'APPROVAL_STALE').some(x=>x.startsWith('user:')));
});

test('a source edit during generation is rejected before or after writes and rolls back',async t=>{
 for(const changeAt of [3,4]){
  const {dir,root,folder}=await reviewCase(t),source='src/Plugins/FormulaStatusPlugin.cs';
  const review=await P.checkPbi(root,folder,true),original=await P.read(root,source),getFile=FileHandle.prototype.getFile;
  let reads=0,changed=false;
  FileHandle.prototype.getFile=async function(){if(this.path===path.join(dir,source)&&++reads===changeAt){await fs.writeFile(this.path,original+'// concurrent source edit\n');changed=true;}return getFile.call(this);};
  try{await assert.rejects(P.approveAndGenerate(root,folder,'Reviewer',review.reviewedContent),/changed after review|nothing was approved/i);}
  finally{FileHandle.prototype.getFile=getFile;}
  assert.equal(changed,true);assert.equal(JSON.parse(await P.read(root,folder+'/pbi-state.json')).approvals.user.status,'pending');
  assert.equal(await P.read(root,folder+'/Refined-PBI-CDMS.md'),null);
 }
});

test('cosmetic line endings and JSON layout do not change the review snapshot',async t=>{
 const {root,folder}=await reviewCase(t),before=await P.reviewFingerprint(root,folder);
 const request=await P.read(root,folder+'/REQUEST.md');
 await P.write(root,folder+'/REQUEST.md',request.replace(/\r?\n/g,'\r\n'));
 assert.equal(await P.reviewFingerprint(root,folder),before,'line endings are cosmetic');
 const meta=JSON.parse(await P.read(root,folder+'/pbi.json'));
 await P.write(root,folder+'/pbi.json',JSON.stringify(meta,null,4)+'\n');
 assert.equal(await P.reviewFingerprint(root,folder),before,'JSON indentation is cosmetic');
});

test('readiness treats HTML br tags as line breaks when synchronizing multiline criteria',async t=>{
 const {c}=await reviewCase(t),state=JSON.parse(JSON.stringify(c.state));
 const originalCriterion=state.acceptanceCriteria[0].criterion;
 state.acceptanceCriteria[0].criterion='Given a Draft formula,\nwhen it is released,\nthen the status is Released';
 const draft=c.docs.draft.replace(originalCriterion,state.acceptanceCriteria[0].criterion.replace(/\n/g,'<br>'));
 const report=await P.readiness(state,{request:'# request',draft,decisionLog:shared.LOG,files:c.docs.files},shared.PBI);
 assert.deepEqual(issues(report,'DOC_CONTENT_MISMATCH').filter(ref=>ref==='AC-1'),[]);
});

test('UI-only covered branches require UI evidence and appear as unverified in handoff',async t=>{
 const {root,folder,c}=await reviewCase(t,'ui');
 c.state.rules[0].branches=[branch({ui:'covered'})];await writeState(root,folder,c.state);
 const report=await P.checkPbi(root,folder,true);
 assert.deepEqual(issues(report,'BRANCH_COVERAGE_UNPROVEN'),['BR-1.Y/ui']);
 const h=P.handoff(c.state,report),b=h.rules[0].branches[0];
 assert.equal(b.coverage.ui,'covered');assert.equal(b.effectiveCoverage.ui,'unverified');
 assert.ok(h.gaps.some(g=>g.branch==='BR-1.Y'&&g.application==='ui'&&g.coverage==='unverified'));
 assert.match(P.branchMatrix(h),/BR-1\.Y[^\n]*unverified \(recorded covered\)/);
});

test('combined branches require evidence for each target, not another application',async t=>{
 const {root,folder,c}=await reviewCase(t,'both'),s=c.state;
 s.evidence.find(e=>e.id==='EV-1').system='cdms';
 s.evidence.push(codeEvidence('EV-DAB','dab','dab'),codeEvidence('EV-UI','ui','javascript'));
 s.rules[0].branches=[branch({cdms:'covered',dab:'covered',ui:'covered'},['EV-1','EV-DAB'])];
 await writeState(root,folder,s);
 let report=await P.checkPbi(root,folder,true);
 assert.deepEqual(issues(report,'BRANCH_COVERAGE_UNPROVEN'),['BR-1.Y/ui']);
 s.rules[0].branches[0].evidence=['EV-UI'];await writeState(root,folder,s);
 report=await P.checkPbi(root,folder,true);
 assert.deepEqual(issues(report,'BRANCH_COVERAGE_UNPROVEN'),['BR-1.Y/cdms','BR-1.Y/dab']);
 const h=P.handoff(s,report),effective=h.rules[0].branches[0].effectiveCoverage;
 assert.deepEqual(effective,{cdms:'unverified',dab:'unverified',ui:'covered'});
 delete s.evidence.find(e=>e.id==='EV-UI').system;await writeState(root,folder,s);
 report=await P.checkPbi(root,folder,true);
 assert.deepEqual(issues(report,'BRANCH_COVERAGE_UNPROVEN'),['BR-1.Y/cdms','BR-1.Y/dab'],'untagged UI components cannot prove a backend branch');
 assert.deepEqual(P.handoff(s,report).rules[0].branches[0].effectiveCoverage,{cdms:'unverified',dab:'unverified',ui:'covered'});
});

test('an unknown citation on an uncovered branch blocks final approval',async t=>{
 const {root,folder,c}=await reviewCase(t);
 c.state.rules[0].branches=[branch({cdms:'missing'},['EV-UNKNOWN'])];await writeState(root,folder,c.state);
 const report=await P.checkPbi(root,folder,true);
 assert.ok(issues(report,'EVIDENCE_UNKNOWN').includes('BR-1.Y/EV-UNKNOWN'));
 assert.ok(P.approvalBlockers(report).length);
});

test('PowerShell and JavaScript agree on UI coverage, source snapshots and cosmetic edits',{skip:process.platform!=='win32'},async t=>{
 const {dir,root,folder,c}=await reviewCase(t,'ui'),pkg=path.join(dir,'package');
 await fs.mkdir(pkg);await fs.mkdir(path.join(dir,'.git'));
 await fs.copyFile(path.join(__dirname,'installer','Install-PBIBuilder.ps1'),path.join(pkg,'Install-PBIBuilder.ps1'));
 const assets=JSON.parse(await fs.readFile(path.join(__dirname,'src','assets.json'),'utf8'));
 await fs.writeFile(path.join(pkg,'pbi-builder-bundle.json'),JSON.stringify(P.bundle(assets)));
 c.state.rules[0].branches=[branch({ui:'covered'})];await writeState(root,folder,c.state);
 const env={...process.env,USERPROFILE:dir};delete env.PSExecutionPolicyPreference;
 const run=async()=>{const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(pkg,'Install-PBIBuilder.ps1'),'-RepoPath',dir,'-Action','CheckPbi','-Pbi',shared.PBI,'-Json'],{encoding:'utf8',env,timeout:120000});
  assert.ok(r.status===0||r.status===3,r.stderr);const js=await P.checkPbi(root,folder);
  assert.deepEqual(JSON.parse(r.stdout),js);return js;};
 const originalMetadata=await P.read(root,folder+'/pbi.json');
 for(const [application,repositories] of [['UI Only',{ui:{path:'.'}}],['DAB + UI',{dab:{path:'.'}}],['unknown-target',[]]]){
  await P.write(root,folder+'/pbi.json',JSON.stringify({...JSON.parse(originalMetadata),application,repositories}));await run();
 }
 await P.write(root,folder+'/pbi.json',originalMetadata);
 const before=await run();assert.deepEqual(issues(before,'BRANCH_COVERAGE_UNPROVEN'),['BR-1.Y/ui']);
 const request=await P.read(root,folder+'/REQUEST.md');
 await P.write(root,folder+'/REQUEST.md',request.replace(/\r?\n/g,'\r\n'));
 const meta=JSON.parse(await P.read(root,folder+'/pbi.json'));await P.write(root,folder+'/pbi.json',JSON.stringify(meta,null,4));
 assert.equal((await run()).reviewedContent,before.reviewedContent);
 meta.parity=['Unicode: café 漢字',`<tag attr="'">&`,1.0,0.0000001,1e21,{nested:['value',null,true]}];
 await P.write(root,folder+'/pbi.json',JSON.stringify(meta));await run();
 await fs.writeFile(path.join(dir,folder,'REQUEST.md'),Buffer.from([0xff,0x0a,0x41]));await run();
 await P.write(root,'src/Plugins/FormulaStatusPlugin.cs','changed source content');
 assert.notEqual((await run()).reviewedContent,before.reviewedContent);
 meta.application='both';await P.write(root,folder+'/pbi.json',JSON.stringify(meta));
 c.state.paths.cdms={applies:true};c.state.paths.dab={applies:true};
 c.state.evidence.push({id:'E-UI',kind:'repo-file',source:'src/Plugins/FormulaStatusPlugin.cs',level:'code',location:'handler',summary:'UI status behavior',system:'ui'});
 c.state.rules[0].branches=[branch({cdms:'covered',dab:'covered',ui:'covered'},['E-UI'])];await writeState(root,folder,c.state);
 assert.deepEqual(issues(await run(),'BRANCH_COVERAGE_UNPROVEN'),['BR-1.Y/cdms','BR-1.Y/dab']);
 const uiEvidence=c.state.evidence.find(e=>e.id==='E-UI');delete uiEvidence.system;uiEvidence.component='javascript';
 await writeState(root,folder,c.state);assert.deepEqual(issues(await run(),'BRANCH_COVERAGE_UNPROVEN'),['BR-1.Y/cdms','BR-1.Y/dab']);
 await fs.unlink(path.join(dir,'src','Plugins','FormulaStatusPlugin.cs'));
 assert.ok(issues(await run(),'EVIDENCE_SOURCE_MISSING').includes('E-UI'));
 await P.write(root,'__proto__','original special-name source');
 c.state.evidence.push({id:'EV-PROTO',level:'code',kind:'repo-file',source:'__proto__',location:'rule',summary:'Local implementation'});
 await writeState(root,folder,c.state);const special=await run();
 assert.ok(!issues(special,'EVIDENCE_SOURCE_MISSING').includes('EV-PROTO'));
 await P.write(root,'__proto__','changed special-name source');assert.notEqual((await run()).reviewedContent,special.reviewedContent);
 c.state.rules[0].branches[0].evidence.push('EV-UNKNOWN','EV-UNKNOWN');await writeState(root,folder,c.state);
 assert.deepEqual(issues(await run(),'EVIDENCE_UNKNOWN'),['BR-1.Y/EV-UNKNOWN']);
 await fs.writeFile(path.join(dir,folder,'REQUEST.md'),Buffer.from([0xef,0xbb,0xbf,0x41,0x0a]));await run();
 await P.write(root,folder+'/pbi.json','{invalid metadata');await run();
 await P.write(root,folder+'/pbi-state.json','{invalid state');assert.ok(issues(await run(),'STATE_MISSING').length);
});

test('approved branch evidence is deduplicated and preserved in Markdown, JSON and DOCX',async t=>{
 const {root,folder,c}=await reviewCase(t),e=codeEvidence('EV-BRANCH','cdms','plugin');
 e.source='../CDMS/src/Rule & Branch.cs';e.location='Validate <branch>';e.summary='Checks A & B';
 c.state.evidence.push(e);c.state.rules[0].branches=[branch({cdms:'covered'},[e.id,e.id])];
 await writeState(root,folder,c.state);
 const review=await P.checkPbi(root,folder,true);
 await P.approveAndGenerate(root,folder,'Reviewer',review.reviewedContent);
 const md=await P.read(root,folder+'/Refined-PBI-CDMS.md'),json=JSON.parse(await P.read(root,folder+'/Refined-PBI-CDMS.json'));
 const doc=zipEntry(await P.readBytes(root,folder+'/Refined-PBI-CDMS.docx'),'word/document.xml');
 assert.deepEqual(json.evidence.filter(x=>x.id===e.id),[e]);
 assert.equal((md.match(/Evidence: EV-BRANCH/g)||[]).length,1);
 for(const value of [e.id,e.source,e.location,e.summary,e.revision]){assert.ok(md.includes(value),'Markdown '+value);assert.ok(doc.includes(xml(value)),'DOCX '+value);}
 assert.deepEqual(json.rules[0].branches[0].evidence,[e.id]);
});

test('UI-only and combined final artifacts preserve every approved branch citation',async t=>{
 for(const target of ['ui','both']){
  const {root,folder,c}=await reviewCase(t,target),s=c.state;
  const ui=codeEvidence('EV-BRANCH-UI','ui','javascript'),proof=[ui],coverage={ui:'covered'};
  s.evidence.push(ui);
  if(target==='both'){
   const cdms=s.evidence.find(e=>e.id==='EV-1'),dab=codeEvidence('EV-BRANCH-DAB','dab','dab');
   cdms.system='cdms';s.evidence.push(dab);proof.unshift(cdms,dab);coverage.cdms='covered';coverage.dab='covered';
  }
  s.rules[0].branches=[branch(coverage,proof.map(e=>e.id))];await writeState(root,folder,s);
  const report=await P.checkPbi(root,folder,true);assert.deepEqual(P.approvalBlockers(report),[]);
  await P.approveAndGenerate(root,folder,'Reviewer',report.reviewedContent);
  for(const name of target==='ui'?['UI']:['CDMS','DAB','UI']){
   const md=await P.read(root,folder+'/Refined-PBI-'+name+'.md'),json=JSON.parse(await P.read(root,folder+'/Refined-PBI-'+name+'.json'));
   const doc=zipEntry(await P.readBytes(root,folder+'/Refined-PBI-'+name+'.docx'),'word/document.xml');
   const exported=json.rules.find(r=>r.id===s.rules[0].id).branches[0];
   for(const [app,status] of Object.entries(coverage)){
    assert.equal(exported[app],status);assert.ok(md.includes(app.toUpperCase()+': '+status));assert.ok(doc.includes(app.toUpperCase()+': '+status));
   }
   for(const e of proof){
    assert.ok(exported.evidence.includes(e.id));assert.deepEqual(json.evidence.find(x=>x.id===e.id),e);
    for(const value of [e.id,e.source,e.location,e.summary,e.revision].filter(Boolean)){
     assert.ok(md.includes(value),'Markdown '+name+' '+value);assert.ok(doc.includes(xml(value)),'DOCX '+name+' '+value);
    }
   }
  }
 }
});

test('approved request details and recorded organizational approvals are present in every format',async t=>{
 const {folder,c}=await reviewCase(t);
 const request={application:'cdms',title:'Formula status',number:'305965',description:'Protect the released formula state.',acceptanceCriteria:'Given a released formula, changes are rejected.'};
 c.state.approvals={user:{status:'approved',by:'Final reviewer',at:'2026-11-01',evidence:'Reviewed in the form'},poba:{status:'approved',by:'Business reviewer',at:'2026-10-30',evidence:'Business review'},technical:{status:'approved',by:'Technical reviewer',at:'2026-10-31',evidence:'Technical review'}};
 const doc=P.finalDocuments(request,c.state,folder)[0],json=JSON.parse(doc.json),word=zipEntry(new Uint8Array(await P.docx(doc.markdown).arrayBuffer()),'word/document.xml');
 for(const value of [request.description,request.acceptanceCriteria,'Business reviewer','Business review','Technical reviewer','Technical review']){
  assert.ok(doc.markdown.includes(value));assert.ok(word.includes(xml(value)));
 }
 assert.equal(json.pbi.description,request.description);assert.equal(json.pbi.originalAcceptanceCriteria,request.acceptanceCriteria);
 assert.equal(json.approval.poba.by,'Business reviewer');assert.equal(json.approval.poba.evidence,'Business review');
 assert.equal(json.approval.technical.by,'Technical reviewer');assert.equal(json.approval.technical.evidence,'Technical review');
});

test('related rules and acceptance criteria remain available in all target formats',async t=>{
 const {folder,c}=await reviewCase(t,'both'),rule=c.state.rules[1];
 rule.paths.cdms={status:'not-applicable',reason:'DAB-only rule'};
 const doc=P.finalDocuments({application:'both',title:'Formula status'},c.state,folder).find(x=>x.name==='Refined-PBI-CDMS.md');
 const json=JSON.parse(doc.json),criterion=c.state.acceptanceCriteria.find(x=>x.rules.includes(rule.id));
 const word=zipEntry(new Uint8Array(await P.docx(doc.markdown).arrayBuffer()),'word/document.xml');
 assert.ok(doc.markdown.includes(rule.rule)&&doc.markdown.includes(criterion.criterion));
 assert.ok(word.includes(xml(rule.rule))&&word.includes(xml(criterion.criterion)));
 assert.ok(json.relatedRuleDetails.some(x=>x.id===rule.id&&x.rule===rule.rule));
 assert.ok(json.relatedAcceptanceCriteria.some(x=>x.id===criterion.id&&x.criterion===criterion.criterion));
});

test('current comparison prompt does not override the decision guidance: questions one at a time (5.5)',async()=>{
 const config=P.normalizeConfig({projectName:'Test',ide:'vscode',role:'cdms'});
 const trial=P.comparison(config,{title:'Formula validation',description:'Preserve existing behavior.'},'2.1-concise');
 for(const run of trial.runs)assert.doesNotMatch(run.prompt,/one (?:unresolved )?(?:business )?question at a time/i);
 const assets=JSON.parse(await fs.readFile(path.join(__dirname,'src','assets.json'),'utf8'));
 const files=P.setupFiles(config,assets,'HTML').files,advisor=files['.github/skills/business-decision-advisor/SKILL.md'];
 const agent=files[P.AGENT],questions=files[P.BASE+'/skills/stage-questions.md'];assert.match(agent,/advisor[\s\S]*SKILL\.md[\s\S]*Read\s+stage-questions\.md with it/);
 assert.match(questions,/ask the\s+remaining questions one at a time/i);assert.match(advisor,/NO RECOMMENDATION/);
 assert.match(advisor,/Ask the unresolved decisions one at a time/);
 assert.match(P.refinePbi('playbook/pbis/pbi-test','Continue').prompt,/unresolved business questions one at a time/i);
 assert.match(P.baselineAgent(config,'2.1-concise'),/one question at a time/i,'historical comparison baseline stays frozen');
});

test('refresh reads a duplicated source once and updates every evidence-index entry',async t=>{
 const {dir,root}=await reviewCase(t),source='src/Validation/Formula Validator ಕ.cs';
 await P.write(root,P.KNOWLEDGE,JSON.stringify({schemaVersion:1,entries:[{id:'K-1',path:source},{id:'K-2',path:source}]}));
 const original=FileHandle.prototype.getFile;let reads=0;
 FileHandle.prototype.getFile=async function(){if(this.path===path.join(dir,source))reads++;return original.call(this);};
 let result;try{result=await P.refreshEvidence(root);}finally{FileHandle.prototype.getFile=original;}
 assert.equal(reads,1);assert.equal(result.checked,2);assert.deepEqual(result.fingerprinted,['K-1','K-2']);
 const entries=JSON.parse(await P.read(root,P.KNOWLEDGE)).entries;
 assert.match(entries[0].sha256,/^[a-f0-9]{64}$/);assert.equal(entries[0].sha256,entries[1].sha256);
});

test('normal approval is singular while unresolved material decisions still block it',async t=>{
 const {root,folder,c}=await reviewCase(t);assert.deepEqual(P.READINESS.requiredApprovals,['user']);
 const ready=await P.checkPbi(root,folder,true);assert.deepEqual(P.approvalBlockers(ready),[]);
 c.state.questions.push({id:'Q-HIGH',blocking:true,owner:'po-ba',status:'open',question:'May this change expose restricted records?'});
 await writeState(root,folder,c.state);const blocked=await P.checkPbi(root,folder,true);
 assert.deepEqual(issues(blocked,'BLOCKING_QUESTION'),['Q-HIGH']);
 await assert.rejects(P.approveAndGenerate(root,folder,'Reviewer',blocked.reviewedContent),/BLOCKING_QUESTION/);
});
