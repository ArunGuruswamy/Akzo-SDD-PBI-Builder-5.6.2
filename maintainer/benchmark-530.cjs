'use strict';
// Reproducible measurements: the frozen 5.2.2 core (fixtures/baseline-v5.2.2-core.cjs) and the current core get identical inputs.
// File reads and writes are counted by instrumenting the file handles, so both versions are measured the same way and no code
// under test counts itself. Timings are machine-specific; the counts are not. Writes docs/PERFORMANCE-5.3.0.md.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const P=require('./src/core.js'),B=require('./fixtures/baseline-v5.2.2-core.cjs'),W=require('./fixtures/workspace.cjs');
const {DirectoryHandle,FileHandle}=require('./fixtures/fs-handles.cjs');
const RUNS=3,PROJECTS=150;
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];

// Counts opens, bytes actually read from file bodies, and writes.
const stats={};const reset=()=>Object.assign(stats,{opens:0,reads:0,bytesRead:0,writes:0,bytesWritten:0,paths:{}});reset();
const getFile=FileHandle.prototype.getFile,createWritable=FileHandle.prototype.createWritable;
FileHandle.prototype.getFile=async function(){const f=await getFile.call(this);stats.opens++;stats.paths[this.path]=(stats.paths[this.path]||0)+1;
 const read=async(fn,len)=>{const r=await fn();stats.reads++;stats.bytesRead+=len(r);return r;};
 return {size:f.size,lastModified:f.lastModified,text:()=>read(()=>f.text(),t=>Buffer.byteLength(t)),arrayBuffer:()=>read(()=>f.arrayBuffer(),b=>b.byteLength),
  slice:(s,e)=>({text:()=>read(()=>f.slice(s,e).text(),t=>Buffer.byteLength(t))})};};
FileHandle.prototype.createWritable=async function(){const w=await createWritable.call(this);return {write:async t=>{stats.writes++;stats.bytesWritten+=typeof t==='string'?Buffer.byteLength(t):t.byteLength;return w.write(t);},close:()=>w.close(),abort:()=>w.abort()};};
async function counted(fn){reset();const t=process.hrtime.bigint(),result=await fn(),ms=Number(process.hrtime.bigint()-t)/1e6,s={...stats};const repeated=Object.values(s.paths).reduce((n,c)=>n+Math.max(0,c-1),0);return {result,ms,opens:s.opens,reads:s.reads,bytesRead:s.bytesRead,writes:s.writes,bytesWritten:s.bytesWritten,repeated};}
const fmt=n=>Number(n).toLocaleString('en-US'),f1=n=>n.toFixed(1);

async function synthetic(dir,n){
 const sln=['Microsoft Visual Studio Solution File, Format Version 12.00'];
 for(let i=0;i<n;i++){const d=path.join(dir,'Src','Svc'+i);await fs.mkdir(d,{recursive:true});
  sln.push(`Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Svc${i}", "Src\\Svc${i}\\Svc${i}.csproj", "{${i}}"`,'EndProject');
  await fs.writeFile(path.join(d,`Svc${i}.csproj`),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup>'+Array.from({length:70},(_,k)=>`<PackageReference Include="Package.${i}.${k}" Version="1.0.${k}" />`).join('')+'</ItemGroup></Project>');
  for(let j=0;j<12;j++)await fs.writeFile(path.join(d,`Class${j}.cs`),`public class C${i}_${j} {}\n`);}
 await fs.writeFile(path.join(dir,'All.sln'),sln.join('\r\n'));await fs.mkdir(path.join(dir,'.git'),{recursive:true});
}
async function discovery(core,label,out){
 const rows=[];
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-bench-'));await synthetic(dir,PROJECTS);const root=new DirectoryHandle(dir),cfg={sources:{legacy:'.'},others:[]};
 const runs=[];runs.push(['first run',await counted(()=>core.discoverSources(root,cfg))]);
 runs.push(['rerun, nothing changed',await counted(()=>core.discoverSources(root,cfg))]);
 for(let i=0;i<3;i++)await fs.appendFile(path.join(dir,'Src','Svc'+i,`Svc${i}.csproj`),'<!-- edit -->');
 runs.push(['rerun, 3 projects edited',await counted(()=>core.discoverSources(root,cfg))]);
 await fs.rm(dir,{recursive:true,force:true});
 for(const [name,r] of runs)out.push({label,name,...r});
}

async function median3(core,label){const all=[];for(let i=0;i<RUNS;i++){const o=[];await discovery(core,label,o);all.push(o);}
 return all[0].map((row,i)=>({...row,ms:median(all.map(r=>r[i].ms))}));}

async function approval(core,label,withGap){
 const results=[];
 for(let i=0;i<RUNS;i++){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-bench-a-')),o={},files=await W.build(fs,path,dir,o),root=new DirectoryHandle(dir);
  const made=P.newPbi(P.normalizeConfig(W.configFor(o)),{title:'Benchmark',number:'B-1',description:'Benchmark requirement.',application:'both',legacy:'legacy'});
  await P.apply(root,await P.plan(root,made.files,false),false);const folder=made.folder,state=await W.stateFor(P,o,folder.split('/').pop(),files);
  state.questions=[];state.rules[0].gaps=[];state.status='Ready for Review';
  await core.write(root,folder+'/pbi-state.json',JSON.stringify(state,null,2));await core.write(root,folder+'/DRAFT-PBI.md',W.draftDoc(state,'Ready for Review'));await core.write(root,folder+'/DECISION-LOG.md','# Decision log\n\nDEC-1 approved.\n');
  const review=await core.checkPbi(root,folder,true);
  results.push(await counted(()=>core.approveAndGenerate(root,folder,'Benchmark approver',review.reviewedContent)));
  await fs.rm(dir,{recursive:true,force:true});}
 return {label,...results[0],ms:median(results.map(r=>r.ms))};
}
function agentSize(core){
 const assets=JSON.parse(require('node:fs').readFileSync(path.join(__dirname,'src/assets.json'),'utf8'));
 const files=core.setupFiles({projectName:'Size',ide:'vscode',role:'dab',sources:{legacy:'../L',cdms:'../C',ui:'../U'}},assets,'<html></html>').files,agent=files[core.AGENT];
 const guides=Object.entries(files).filter(([p])=>p.includes('/skills/')||p.includes('business-decision-advisor')).map(([,t])=>t.length);
 return {agent:agent.length,guides:guides.length,guideChars:guides.reduce((a,b)=>a+b,0)};
}

(async()=>{
 const base=await median3(B,'5.2.2'),cur=await median3(P,'5.3.0');
 const a522=await approval(B,'5.2.2'),a530=await approval(P,'5.3.0'),s522=agentSize(B),s530=agentSize(P);
 const L=[];const row=(b,c)=>`| ${c.name} | ${fmt(b.opens)} → ${fmt(c.opens)} | ${fmt(b.bytesRead)} → ${fmt(c.bytesRead)} | ${b.writes} → ${c.writes} | ${fmt(b.bytesWritten)} → ${fmt(c.bytesWritten)} | ${f1(b.ms)} → ${f1(c.ms)} |`;
 L.push('# Performance measurements: 5.2.2 versus 5.3.0','',`Generated by maintainer/benchmark-530.cjs on ${new Date().toISOString().slice(0,10)} (${os.cpus()[0].model.trim()}, Node ${process.version}, ${process.platform}). Median of ${RUNS} runs for time; counts come from instrumenting the file handles, identically for both versions (the frozen 5.2.2 core is maintainer/fixtures/baseline-v5.2.2-core.cjs). Counts are reproducible; times are not.`,'',
  `## Source discovery on a synthetic workspace (${PROJECTS} projects of about 4 KiB each, one solution, ${PROJECTS*12} source files)`,'','Each cell is 5.2.2 → 5.3.0. File opens include existence and size checks; bytes are file body bytes actually read; writes are file writes.','',
  '| Run | File opens | Bytes read | Writes | Bytes written | Time (ms) |','| --- | ---: | ---: | ---: | ---: | ---: |');
 for(let i=0;i<base.length;i++)L.push(row(base[i],cur[i]));
 L.push('','The directory walk still lists every non-excluded entry on every run: a browser cannot know which folders changed without listing them. What 5.3.0 removes is rereading and reparsing unchanged solutions and projects, and rewriting an identical map. On a repository with small project files the previous map costs about as many bytes as it saves; the saving grows with project file size and count.','',
  '## Approve & Generate on a CDMS + DAB + UI PBI (7 evidence sources, 3 documents × 3 formats)','','| Version | File opens | Opens of an already opened file | Bytes read | Writes | Time (ms) |','| --- | ---: | ---: | ---: | ---: | ---: |');
 for(const r of [a522,a530])L.push(`| ${r.label} | ${fmt(r.opens)} | ${fmt(r.repeated)} | ${fmt(r.bytesRead)} | ${r.writes} | ${f1(r.ms)} |`);
 L.push('','Approve & Generate rereads working documents and evidence several times on purpose: each pass is an integrity check (review snapshot, content scan, post-write verification, final readiness check) that protects the approval from concurrent edits. 5.3.0 did not weaken or remove any of them, so this count is expected to be unchanged.','',
  '## Agent instruction size (characters loaded into every conversation, then guides loaded lazily when their step starts)','','| Version | Agent file | Guide files | Guide characters (loaded only when needed) |','| --- | ---: | ---: | ---: |',
  `| 5.2.2 | ${fmt(s522.agent)} | ${s522.guides} | ${fmt(s522.guideChars)} |`,`| 5.3.0 | ${fmt(s530.agent)} | ${s530.guides} | ${fmt(s530.guideChars)} |`,'',
  `The 5.3.0 agent file is ${s530.agent>=s522.agent?'larger':'smaller'} by ${fmt(Math.abs(s530.agent-s522.agent))} characters: the compact workflow router, the minimum-sufficient-evidence policy and the shared-UI and difference-map rules replaced the earlier guide list but added new rules. Token cost is not claimed to fall; guides still load only when a step needs them.`,'',
  '## Not measured here','Model tokens, tool calls, wall-clock time of a real refinement and the quality of Copilot answers happen inside the chat host. The page reports file opens, bytes, writes and elapsed time through Run details; the agent records the rest in EVIDENCE.md "Run metrics" when its host exposes them.','');
 await fs.writeFile(path.join(__dirname,'..','docs','PERFORMANCE-5.3.0.md'),L.join('\n'),'utf8');console.log(L.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1;});
