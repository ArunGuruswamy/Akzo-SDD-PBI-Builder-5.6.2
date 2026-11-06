'use strict';
// Compare the current local baseline supplied by the maintainer, never a remote release.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const P=require('./src/core.js'),W=require('./fixtures/workspace.cjs'),{DirectoryHandle}=require('./fixtures/fs-handles.cjs');
const baseline=process.argv[2];if(!baseline)throw Error('Pass the preserved local baseline core.cjs path.');
const B=require(path.resolve(baseline));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
async function run(core){
 const samples=[];
 for(let i=0;i<5;i++){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-target-bench-'));
  try{
   const files=await W.build(fs,path,dir,{}),root=new DirectoryHandle(dir),config=core.normalizeConfig(W.configFor({}));
   await core.discoverSources(root,config);
   const made=core.newPbi(config,{number:'BENCH',title:'Measurement',description:'Save a measurement',application:'both',legacy:'legacy'});
   await core.apply(root,await core.plan(root,made.files));
   const state=await W.stateFor(core,{},made.folder.split('/').pop(),files);
   await core.write(root,made.folder+'/pbi-state.json',JSON.stringify(state));
   await core.write(root,made.folder+'/DRAFT-PBI.md',W.draftDoc(state,state.status));
   await core.write(root,made.folder+'/DECISION-LOG.md','DEC-1 approved.\n');
   const evidencePath=Object.keys(files).find(p=>p.endsWith('.cs'));
   await core.write(root,core.KNOWLEDGE,JSON.stringify({schemaVersion:1,entries:[{id:'K-1',path:evidencePath,revision:'workspace'}]}));
   await core.refreshEvidence(root);
   const discovery=await core.measure(()=>core.discoverSources(root,config));
   const freshness=await core.measure(()=>core.refreshEvidence(root));
   const readiness=await core.measure(()=>core.checkPbi(root,made.folder));
   const row={discovery:discovery.metrics,freshness:freshness.metrics,readiness:readiness.metrics};
   if(core.synchronizePbi){await core.synchronizePbi(root,made.folder);row.synchronize=(await core.measure(()=>core.synchronizePbi(root,made.folder))).metrics;}
   samples.push(row);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 }
 return Object.fromEntries(Object.keys(samples[0]).map(op=>[op,{...samples[0][op],elapsedMs:median(samples.map(s=>s[op].elapsedMs))}]));
}
(async()=>{
 const before=await run(B),after=await run(P);
 console.log(JSON.stringify({baseline:path.basename(baseline),node:process.version,runs:5,timing:'median milliseconds; file-operation counts from first run',
  before,after,hostToolCalls:'NOT MEASURED: filesystem API operations below are not Copilot tool calls.',modelTokens:'NOT MEASURED'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
