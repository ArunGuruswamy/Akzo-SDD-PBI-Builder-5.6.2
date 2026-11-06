'use strict';
// Measures the deterministic Builder operations on identical inputs for the frozen 3.1.0 core and the current core,
// and writes docs/PERFORMANCE.md. Model-side work (searches, files read, refinement time) is measured with Compare old & new.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const P=require('./src/core.js'),V31=require('./fixtures/baseline-v3.1.0-core.cjs'),{DirectoryHandle,FileHandle}=require('./fixtures/fs-handles.cjs');
const RUNS=7,LIST_RUNS=3,FILES=300,median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
async function time(fn){const t=[];for(let i=0;i<RUNS;i++){const s=process.hrtime.bigint();await fn();t.push(Number(process.hrtime.bigint()-s)/1e6);}return median(t);}
async function listPbis51(root){let dir;try{dir=await root.getDirectoryHandle('playbook');dir=await dir.getDirectoryHandle('pbis');}catch(e){if(e.name==='NotFoundError')return [];throw e;}
 const items=[];for await(const [name,entry]of dir.entries()){if(entry.kind!=='directory')continue;let title=name,number='',metadataWarning='';const folder='playbook/pbis/'+name;P.safePath(folder);const raw=await P.read(root,folder+'/pbi.json');if(raw){try{const m=JSON.parse(raw);if(m.kind==='comparison')continue;title=String(m.title||name);number=String(m.number||'');}catch{metadataWarning='Unreadable intake metadata; inspect saved documents.';}}
  const present=[];for(const file of ['REQUEST.md','DRAFT-PBI.md','REFINED-PBI.md','VALIDATION-MATRIX.md','OPEN-QUESTIONS.md','DECISION-LOG.md','EVIDENCE.md','pbi-state.json'])if(await P.read(root,folder+'/'+file)!==null)present.push(file);
  if(raw||present.length)items.push({folder,title,number,present,metadataWarning});}
 return items.sort((a,b)=>a.title.localeCompare(b.title));
}
async function measureListing(list,root){let reads=0,bytes=0;const original=FileHandle.prototype.getFile;
 FileHandle.prototype.getFile=async function(){const f=await original.call(this);reads++;return{text:async()=>{const text=await f.text();bytes+=Buffer.byteLength(text);return text;},arrayBuffer:async()=>{const b=await f.arrayBuffer();bytes+=b.byteLength;return b;}};};
 try{const start=process.hrtime.bigint();const items=await list(root);return{ms:Number(process.hrtime.bigint()-start)/1e6,reads,bytes,count:items.length};}
 finally{FileHandle.prototype.getFile=original;}
}
async function listingRepo(count){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-list-bench-')),root=new DirectoryHandle(dir),base=path.join(dir,'playbook','pbis');
 await fs.mkdir(base,{recursive:true});const docs=['REQUEST.md','DRAFT-PBI.md','REFINED-PBI.md','VALIDATION-MATRIX.md','OPEN-QUESTIONS.md','DECISION-LOG.md','EVIDENCE.md','pbi-state.json'],body='x'.repeat(4096);
 for(let i=0;i<count;i++){const name='pbi-'+String(i+1).padStart(6,'0'),folder=path.join(base,name);await fs.mkdir(folder);await fs.writeFile(path.join(folder,'pbi.json'),JSON.stringify({number:String(i+1),title:'Benchmark PBI '+String(i+1).padStart(6,'0')}));
  for(const doc of docs)await fs.writeFile(path.join(folder,doc),body);}
 return{dir,root};
}
// A large PBI: 60 rules, 240 criteria, 120 evidence records; the current core also gets 4 branches per rule.
function bigState(withBranches){
 const PBI='pbi-900000-benchmark',rules=[],acs=[],evidence=[];
 for(let i=1;i<=60;i++){const id='BR-'+i;
  evidence.push({id:'EV-'+i,level:'code',kind:'external',source:'../Legacy/Rule'+i+'.cs',location:'lines 1-20',revision:'main abc',summary:'Rule '+i+' code'},{id:'EV-R'+i,level:'reach',kind:'external',source:'../DAB/Rule'+i+'.cs',location:'lines 1-20',revision:'main abc',summary:'Rule '+i+' path'});
  ['positive','negative','boundary','permission'].forEach((type,j)=>acs.push({id:'AC-'+i+'-'+j,rev:1,rules:[id],type,criterion:'Given case '+j+' of rule '+i+', when saved, then the outcome '+j+' applies'}));
  const r={id,rev:1,rule:'Business rule number '+i+' with its condition, outcome and exceptions',context:'Entity '+i,owner:{type:'application'},evidence:['EV-'+i],
   paths:{cdms:{status:'reaches',evidence:['EV-R'+i]},dab:{status:'reaches',evidence:['EV-R'+i]}},targetAction:'implement',decision:'confirmed',decisionRef:'DEC-1',coverage:['positive','negative','boundary','permission']};
  if(withBranches)r.branches=[0,1,2,3].map(j=>({id:id+'.B'+j,condition:'Branch '+j,expected:'Outcome '+j,cdms:'missing',dab:'missing',acceptance:['AC-'+i+'-'+j]}));
  rules.push(r);}
 const s={schemaVersion:2,pbi:PBI,status:'Draft',paths:{cdms:{applies:true},dab:{applies:true}},actors:[{id:'ACT-1',role:'User',permissions:'Editor',identity:'caller',unauthorizedBehavior:'Error'}],
  rules,acceptanceCriteria:acs,evidence,questions:[],assumptions:[],decisions:[{id:'DEC-1',pbi:PBI,status:'approved',evidence:'PO',supersedes:''}],dependencies:[],
  feasibility:{status:'reviewed',evidence:'TL'},approvals:{poba:{status:'pending'},technical:{status:'pending'},user:{status:'pending'}},approvalHistory:[]};
 const draft=['# PBI','Status: Draft',...rules.map(r=>r.id+' '+r.rule),...acs.map(a=>a.id+' '+a.criterion)].join('\n');
 return {PBI,state:s,docs:{request:'# R\n',draft,refined:null,files:{},decisionLog:'DEC-1\n'}};
}
async function evidenceRepo(Core){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-bench-')),root=new DirectoryHandle(dir),entries=[];
 for(let i=0;i<FILES;i++){const p='src/Legacy/File'+i+'.cs';await Core.write(root,p,('// rule '+i+'\n').repeat(1500));entries.push({id:'K-'+i,path:p,fact:'Fact '+i,repository:'legacy',revision:'abc'});}
 await Core.write(root,Core.KNOWLEDGE,JSON.stringify({schemaVersion:1,entries}));return {dir,root};
}
(async()=>{
 const rows=[],listingRows=[];const add=(op,v31,cur,note)=>rows.push({op,v31,cur,note});
 for(const count of [100,1000]){const {dir,root}=await listingRepo(count);try{
   const before=[],after=[];for(let i=0;i<LIST_RUNS;i++){before.push(await measureListing(listPbis51,root));after.push(await measureListing(P.listPbis,root));}
   assert.equal(before[0].count,count);assert.equal(after[0].count,count);
   listingRows.push({count,before:median(before.map(x=>x.ms)),after:median(after.map(x=>x.ms)),beforeReads:median(before.map(x=>x.reads)),afterReads:median(after.map(x=>x.reads)),beforeBytes:median(before.map(x=>x.bytes)),afterBytes:median(after.map(x=>x.bytes))});
  }finally{await fs.rm(dir,{recursive:true,force:true});}}
 for(const [Core,label] of [[V31,'v31'],[P,'cur']]){
  const b=bigState(false);const r=await Core.readiness(b.state,b.docs,b.PBI);assert.ok(r.computedStatus,label);}
 const plain=bigState(false),branched=bigState(true);
 add('Readiness check, 60 rules / 240 criteria (ms)',await time(()=>V31.readiness(plain.state,plain.docs,plain.PBI)),await time(()=>P.readiness(plain.state,plain.docs,plain.PBI)),'same input');
 add('Readiness check with 240 branches (ms)','n/a',await time(()=>P.readiness(branched.state,branched.docs,branched.PBI)),'branches are new in this version');
 add('Developer handoff generation, 240 branches (ms)','n/a',await time(()=>P.handoff(branched.state,null)),'new in this version');
 for(const [Core,key] of [[V31,'v31'],[P,'cur']]){
  const {dir,root}=await evidenceRepo(Core);
  const t0=process.hrtime.bigint();await Core.refreshEvidence(root);const cold=Number(process.hrtime.bigint()-t0)/1e6;
  const warm=await time(()=>Core.refreshEvidence(root));
  const res=await Core.refreshEvidence(root);assert.equal(res.stale.length,0);
  await fs.rm(dir,{recursive:true,force:true});
  rows.push({op:'Evidence refresh, '+FILES+' files x 21 KB, '+key,cold,warm});
 }
 const ev=rows.filter(r=>r.cold!==undefined);
 const f=n=>typeof n==='number'?n.toFixed(1):n;
 const md=['# Performance measurements','',`Generated by maintainer/benchmark.cjs on ${new Date().toISOString().slice(0,10)} (${os.cpus()[0].model.trim()}, Node ${process.version}, ${os.platform()}). Median of ${RUNS} runs; the frozen 3.1.0 core (maintainer/fixtures/baseline-v3.1.0-core.cjs) and the current core get identical inputs.`,'',
  '| Operation | 3.1.0 | Current | Note |','| --- | --- | --- | --- |',...rows.filter(r=>r.cold===undefined).map(r=>`| ${r.op} | ${f(r.v31)} | ${f(r.cur)} | ${r.note} |`),'',
  '## PBI listing: 5.1.0 implementation versus current','',
  `Synthetic folders contain pbi.json plus eight 4 KiB documents. Median of ${LIST_RUNS} runs per size; the pre-change function is the 5.1.0 implementation from the repository baseline. Content reads and bytes count only file bodies opened by listing.`,'',
  '| PBIs | 5.1.0 time (ms) | Current time (ms) | Content reads (before → after) | Bytes read (before → after) |',
  '| ---: | ---: | ---: | ---: | ---: |',...listingRows.map(r=>`| ${r.count} | ${f(r.before)} | ${f(r.after)} | ${r.beforeReads} → ${r.afterReads} | ${r.beforeBytes.toLocaleString('en-US')} → ${r.afterBytes.toLocaleString('en-US')} |`),'',
  '| Evidence refresh | Cold: first fingerprint (ms) | Warm: unchanged files (ms) |','| --- | --- | --- |',...ev.map(r=>`| ${r.op.endsWith('v31')?'3.1.0':'Current'} (${FILES} files) | ${f(r.cold)} | ${f(r.warm)} |`),'',
  'Warm refresh still hashes every indexed file on purpose: a changed file must never be reported current. The index lets the agent skip rereading',
  'unchanged sources, which is where the time goes in a real refinement.','',
  '## Not measured here','Cold-start and warm-start analysis time, repository discovery time, files inspected, search calls, cache hit rate and refinement duration',
  'happen inside Copilot. The agent now records files read, searches and evidence index entries reused in EVIDENCE.md, and Compare old & new',
  'has columns for them (files_read, cache_entries_reused, cold_or_warm). No numbers are claimed until real runs are recorded.',''].join('\n');
 await fs.writeFile(path.join(__dirname,'..','docs','PERFORMANCE.md'),md);
 console.log(md);
})().catch(e=>{console.error(e);process.exitCode=1;});
