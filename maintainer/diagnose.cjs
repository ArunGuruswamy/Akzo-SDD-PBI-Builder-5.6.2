'use strict';
// Reproducible diagnostic: generated instruction sizes per IDE profile, in-process stage metrics, and Windows PowerShell
// CheckPbi/SyncPbi wall-clock (median and p95) on one identical fixture. Read-only for real repositories: it works in a temp
// directory and a temp USERPROFILE. Usage: node diagnose.cjs [runs=7] | node diagnose.cjs --instructions (sizes only, no PowerShell)
// Not measured here: model tokens, Copilot latency, tool calls issued by the chat host. Characters are not tokens.
const fs=require('node:fs/promises'),fss=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const P=require('./src/core.js'),W=require('./fixtures/workspace.cjs'),{DirectoryHandle}=require('./fixtures/fs-handles.cjs');
const assets=JSON.parse(fss.readFileSync(path.join(__dirname,'src/assets.json'),'utf8'));
const runs=Math.max(3,+process.argv[2]||7);
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.ceil(p/100*s.length)-1)];};
const stat=a=>({median:pct(a,50),p95:pct(a,95),min:Math.min(...a),max:Math.max(...a),runs:a.length});

function sizes(){
 const out={};
 for(const ide of ['visualstudio','vscode']){
  const cfg=P.normalizeConfig({projectName:'Diag',ide,role:'cdms',sources:{legacy:'../L',dab:'../D',ui:'../U'},includeReferences:true});
  const f=P.setupFiles(cfg,assets).files,len=p=>String(f[p]??'').length;
  const all=Object.keys(f).filter(p=>/\/skills\/.*\.md$|SKILL\.md$/.test(p)),stage=all.filter(p=>/\/skills\/stage-/.test(p)),guides=all.filter(p=>!stage.includes(p));
  out[ide]={agentChars:len(P.AGENT),guideCountAndChars:guides.map(p=>[p.split('/').pop(),len(p)]),allGuideChars:guides.reduce((s,p)=>s+len(p),0),
   stageModuleChars:stage.map(p=>[p.split('/').pop(),len(p)]),allStageModuleChars:stage.reduce((s,p)=>s+len(p),0),
   neverAutoLoadedReferenceChars:Object.keys(f).filter(p=>/\/references\//.test(p)).reduce((s,p)=>s+len(p),0)};
 }
 return out;
}

// Instructions a conversation holds per workflow, following the agent's Workflow router. Baseline = the frozen single-file
// 5.3.0 agent (fixtures/baseline-v5.3.0-agents.json) with the same guides and no stage modules. Characters are counted;
// "estimatedTokens" is characters/4, an ESTIMATE only: real token counts come from the chat host and are not measured here.
const SCENARIOS={
 'Start PBI: intake, analysis, first questions':{guides:['guided-pbi-creation','execution-path-analysis','business-rule-ownership','ADVISOR'],stages:['intake','analysis','evidence','cross-repo','questions','artifacts']},
 'Resume and answer business questions':{guides:['guided-pbi-creation','ADVISOR','business-rule-branch-completeness','readiness-and-approval'],stages:['resume','questions','evidence','artifacts']},
 'Resume with CDMS to DAB + shared UI re-analysis':{guides:['guided-pbi-creation','execution-path-analysis','business-rule-ownership','business-rule-branch-completeness','readiness-and-approval'],stages:['resume','analysis','evidence','cross-repo','artifacts']},
 'Review, approve and generate':{guides:['readiness-and-approval'],stages:['resume','approval','artifacts']},
 'Validate PBI or Show Decisions (read-only)':{guides:['readiness-and-approval'],stages:['resume']},
 'Extract Plugin Rules / Analyze Workflows':{guides:['crm-plugin-workflow-intelligence','xrm-workflow-intelligence'],stages:['resume','evidence','artifacts']},
 'Everything in one conversation (worst case)':{guides:['guided-pbi-creation','execution-path-analysis','business-rule-ownership','business-rule-branch-completeness','readiness-and-approval','repository-knowledge','crm-plugin-workflow-intelligence','xrm-workflow-intelligence','ADVISOR'],stages:['intake','resume','analysis','evidence','cross-repo','questions','approval','artifacts']},
};
function context(){
 const baseline=JSON.parse(fss.readFileSync(path.join(__dirname,'fixtures/baseline-v5.3.0-agents.json'),'utf8')),out={};
 for(const ide of ['visualstudio','vscode']){
  const f=P.setupFiles({...baseline.config,ide},assets).files,len=p=>String(f[p]??'').length;
  const guidePath=n=>n==='ADVISOR'?'.github/skills/business-decision-advisor/SKILL.md':P.BASE+'/skills/'+n+'.md';
  const rows={};
  for(const [name,s] of Object.entries(SCENARIOS)){
   // Baseline uses the frozen pre-split guides; current uses today's guides plus the stage modules the router names.
   const gBefore=s.guides.reduce((t,n)=>t+String(baseline.guides[guidePath(n)]??'').length,0),gNow=s.guides.reduce((t,n)=>t+len(guidePath(n)),0);
   const m=s.stages.reduce((t,n)=>t+len(P.BASE+'/skills/stage-'+n+'.md'),0);
   const before=baseline.agents[ide].length+gBefore,after=len(P.AGENT)+gNow+m;
   rows[name]={baselineChars:before,currentChars:after,savedChars:before-after,savedPercent:+((before-after)/before*100).toFixed(1),
    estimatedTokensBaseline:Math.round(before/4),estimatedTokensCurrent:Math.round(after/4),modulesRead:s.stages.length};
  }
  out[ide]={alwaysLoadedAgentChars:{baseline:baseline.agents[ide].length,current:len(P.AGENT),savedPercent:+((1-len(P.AGENT)/baseline.agents[ide].length)*100).toFixed(1)},scenarios:rows};
 }
 return out;
}

async function main(){
 if(process.argv.includes('--instructions')){console.log(JSON.stringify({instructionSizes:sizes(),instructionContext:context(),
  instructionNote:'Characters are measured. estimatedTokens = characters/4 is an estimate, not a host token measurement.'},null,2));return;}
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-diag-'));
 try{
  await fs.mkdir(path.join(dir,'.git'));
  const files=await W.build(fs,path,dir,{}),root=new DirectoryHandle(dir),config=P.normalizeConfig(W.configFor({}));
  await P.discoverSources(root,config);
  const made=P.newPbi(config,{number:'DIAG',title:'Diagnostic',description:'d',application:'both',legacy:'legacy'});
  await P.apply(root,await P.plan(root,made.files));
  const pbi=made.folder.split('/').pop(),state=await W.stateFor(P,{},pbi,files);
  await P.write(root,made.folder+'/pbi-state.json',JSON.stringify(state));
  await P.write(root,made.folder+'/DRAFT-PBI.md',W.draftDoc(state,state.status));
  await P.write(root,made.folder+'/DECISION-LOG.md','DEC-1 approved.\n');
  // One reusable finding with a dependency, so evidence refresh has real work (hash, dependency hash, reuse verdict).
  const cs=Object.keys(files).filter(p=>p.endsWith('.cs'));
  await P.write(root,P.KNOWLEDGE,JSON.stringify({schemaVersion:1,entries:[{id:'K-1',path:cs[0],dependsOn:cs.slice(1,2)}]}));
  await P.refreshEvidence(root);
  const stages={};
  for(const [name,fn] of [['discoverSources (warm)',()=>P.discoverSources(root,config)],['refreshEvidence',()=>P.refreshEvidence(root)],
   ['checkPbi',()=>P.checkPbi(root,made.folder)],['synchronizePbi',()=>P.synchronizePbi(root,made.folder)],['advanceWorkflow',()=>P.advanceWorkflow(root,made.folder)]]){
   const times=[];let m;for(let i=0;i<runs;i++){m=(await P.measure(fn)).metrics;times.push(m.elapsedMs);}
   stages[name]={elapsedMs:stat(times),lastRun:{fileOpens:m.fileOpens,distinctFiles:m.distinctFiles,repeatedOpens:m.repeatedOpens,missingOpens:m.missingOpens,bytesRead:m.bytesRead,writes:m.writes}};
  }
  // PowerShell: same package layout the installer uses. USERPROFILE is a persistent scratch profile reused across runs, like a
  // real user's (a fresh profile per launch adds about 0.2-0.4 s on Windows); the real install log is never touched.
  const pkg=path.join(dir,'package');await fs.mkdir(pkg);
  await fs.copyFile(path.join(__dirname,'installer/Install-PBIBuilder.ps1'),path.join(pkg,'Install-PBIBuilder.ps1'));
  await fs.writeFile(path.join(pkg,'pbi-builder-bundle.json'),JSON.stringify(P.bundle(assets)));
  await fs.writeFile(path.join(pkg,'Akzo-SDD-PBI-Builder.html'),'<html></html>');
  const profile=path.join(os.tmpdir(),'akzo-diagnose-profile');await fs.mkdir(profile,{recursive:true});
  const env={...process.env,USERPROFILE:profile};delete env.PSExecutionPolicyPreference;
  const ps=(action,...extra)=>{const t=process.hrtime.bigint(),r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(pkg,'Install-PBIBuilder.ps1'),'-RepoPath',dir,'-Action',action,...(action==='RefreshEvidence'?[]:['-Pbi',pbi]),...extra,'-Json'],{encoding:'utf8',env,timeout:180000});
   if(![0,3].includes(r.status))throw Error(action+' failed: '+(r.stderr||r.stdout));return Number((process.hrtime.bigint()-t)/1000000n);};
  const empty=[];for(let i=0;i<runs;i++){const t=process.hrtime.bigint();cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','1'],{env});empty.push(Number((process.hrtime.bigint()-t)/1000000n));}
  ps('CheckPbi'); // first call is reported separately as cold
  const cold=ps('SyncPbi');
  const check=[],sync=[],pair=[],evidence=[],resumeTwo=[],resumeOne=[];
  for(let i=0;i<runs;i++){const c=ps('CheckPbi'),s=ps('SyncPbi'),e=ps('RefreshEvidence'),s2=ps('SyncPbi'),one=ps('SyncPbi','-RefreshEvidence');
   check.push(c);sync.push(s);pair.push(s+c);evidence.push(e);resumeTwo.push(e+s2);resumeOne.push(one);}
  const report={generatedAt:new Date().toISOString(),node:process.version,runs,
   instructionSizes:sizes(),instructionContext:context(),
   instructionNote:'Characters are measured. estimatedTokens = characters/4 is an estimate, not a host token measurement.',
   inProcessStages:stages,
   powershellMs:{emptyProcess:stat(empty),CheckPbi:stat(check),SyncPbi:stat(sync),RefreshEvidence:stat(evidence),'SyncPbi then CheckPbi (old flow)':stat(pair),'SyncPbi only (current flow)':stat(sync),
    'Resume: RefreshEvidence then SyncPbi (two launches)':stat(resumeTwo),'Resume: SyncPbi -RefreshEvidence (one launch)':stat(resumeOne),firstSyncAfterCheck:cold},
   notMeasured:['model tokens','Copilot end-to-end latency','host tool-call counts','time waiting for the user']};
  console.log(JSON.stringify(report,null,2));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
