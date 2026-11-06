'use strict';
// Shared readiness scenarios: test-core.cjs checks expectations, test-ps.cjs checks PowerShell gives identical reports.
// load(core) computes the approval fingerprints with the code under test, as the wizard shows them to the agent.
const PBI='pbi-300186-formula-status-20261027-ab12cd34';
const clone=x=>JSON.parse(JSON.stringify(x));
const SOURCES={'src/Plugins/FormulaStatusPlugin.cs':'public class FormulaStatusPlugin : IPlugin { /* Released -> Draft rejected */ }\r\n',
 'deploy/PluginRegistration.xml':'<step plugin="FormulaStatusPlugin" message="Update" stage="PreOperation" state="Enabled"/>\n',
 'src/Validation/Formula Validator ಕ.cs':'public class FormulaValidator { /* unique name per BU */ }\n'};
const RULES={'BR-1':'Released formulas cannot change status back to Draft','BR-2':'Formula name is unique within its business unit'};
const CRITERIA={'AC-1':'Given a Draft formula, when it is released, then the status is Released','AC-2':'Given a Released formula, when a user sets it to Draft, then the save is rejected with the status error',
 'AC-3':'Given a Released formula, when it is set to Archived, then the change is allowed','AC-4':'Given a user without formula edit rights, when they change status, then access is denied',
 'AC-5':'Given a new formula with a unique name in the BU, when saved, then it is created','AC-6':'Given a second formula with the same name in the same BU, when saved, then it is rejected',
 'AC-7':'Given a name that differs only in letter case, when saved, then it counts as a duplicate'};
const TYPES={'AC-1':['BR-1','positive'],'AC-2':['BR-1','negative'],'AC-3':['BR-1','boundary'],'AC-4':['BR-1','permission'],'AC-5':['BR-2','positive'],'AC-6':['BR-2','negative'],'AC-7':['BR-2','boundary']};
function base(){return {
 schemaVersion:2,pbi:PBI,status:'Development-Ready',
 paths:{cdms:{applies:true},dab:{applies:true},ocp:{applies:false,reason:'No OCP operation writes formulas'}},
 actors:[{id:'ACT-1',role:'Regional formulator',permissions:'Formula editor, own BU',identity:'caller',unauthorizedBehavior:'Save rejected with access error'},
  {id:'ACT-2',role:'DAB integration',permissions:'Service principal with write on formula',identity:'service',unauthorizedBehavior:'401 for unauthenticated callers'}],
 rules:[{id:'BR-1',rev:1,rule:RULES['BR-1'],context:'Formula, update, Released, all BUs',owner:{type:'plugin',component:'FormulaStatusPlugin'},
   registration:'active',runtime:'not-verified',evidence:['EV-1','EV-2'],paths:{cdms:{status:'reaches',evidence:['EV-3']},dab:{status:'bypasses',evidence:['EV-4']}},
   targetAction:'extend',dependencies:['DEP-1'],decision:'confirmed',decisionRef:'DEC-1',coverage:['positive','negative','boundary','permission'],gaps:[]},
  {id:'BR-2',rev:1,rule:RULES['BR-2'],context:'Formula, create and update',owner:{type:'application',component:'FormulaValidator'},evidence:['EV-5'],
   paths:{cdms:{status:'reaches',evidence:['EV-6']},dab:{status:'reaches',evidence:['EV-6']}},targetAction:'reuse',decision:'confirmed',decisionRef:'DEC-2'}],
 acceptanceCriteria:Object.entries(TYPES).map(([id,[rule,type]])=>({id,rev:1,rules:[rule],type,criterion:CRITERIA[id]})),
 evidence:[{id:'EV-1',level:'code',kind:'repo-file',source:'src/Plugins/FormulaStatusPlugin.cs',location:'Execute, lines 20-48',summary:'Rejects Released to Draft'},
  {id:'EV-2',level:'registration',kind:'repo-file',source:'deploy/PluginRegistration.xml',location:'Update step',summary:'Enabled pre-operation Update step'},
  {id:'EV-3',level:'reach',kind:'external',source:'CDMS DEV form save trace',location:'Formula main form, Save',revision:'2026-10-21T09:30:00Z',summary:'Form save sends UpdateRequest through the step'},
  {id:'EV-4',level:'reach',kind:'external',source:'../DAB/src/Mutations/UpdateFormula.cs',location:'UpdateFormula, lines 10-60',revision:'DAB main a1b2c3d',summary:'Writes to SQL without the CRM pipeline'},
  {id:'EV-5',level:'code',kind:'repo-file',source:'src/Validation/Formula Validator ಕ.cs',location:'ValidateName',summary:'Shared uniqueness check'},
  {id:'EV-6',level:'reach',kind:'external',source:'../DAB/src/Mutations/CreateFormula.cs',location:'Create and update',revision:'DAB main a1b2c3d',summary:'CDMS plugin and DAB both call the validator'}],
 questions:[{id:'Q-1',blocking:true,owner:'po-ba',status:'resolved',question:'May a Released formula return to Draft?',resolution:'No; create a new version',decisionRef:'DEC-1'}],
 assumptions:[{id:'AS-1',changesBehavior:true,status:'resolved'}],
 decisions:[{id:'DEC-1',pbi:PBI,status:'approved',evidence:'PO in chat 2026-10-20',supersedes:''},{id:'DEC-2',pbi:PBI,status:'approved',evidence:'BA in refinement 2026-10-21',supersedes:''}],
 dependencies:[{id:'DEP-1',repository:'DAB',responsibility:'Add status validation to the update mutation'}],
 feasibility:{status:'reviewed',evidence:'Tech lead review 2026-10-22'},
 approvals:{poba:{status:'pending'},technical:{status:'pending'},user:{status:'pending'}},approvalHistory:[]};}
function doc(status,s,ids){
 if(ids!==undefined)return '# PBI 300186\nStatus: '+status+'\n\n'+ids+'\n';
 const row=r=>'| '+r.id+' | '+(r.rule??r.criterion??r.responsibility)+' |';
 return ['# PBI 300186 Formula status','Status: '+status,'','## Business rules and exceptions','| ID | Rule |','| --- | --- |',...s.rules.map(row),'',
  '## Acceptance criteria','| ID | Criterion |','| --- | --- |',...s.acceptanceCriteria.map(row),'','## Dependencies',...s.dependencies.map(d=>'- '+d.id+' '+d.repository+': '+d.responsibility),''].join('\n');}
const LOG='# Decision log\n\nDEC-1 approved by PO in chat 2026-10-20\nDEC-2 approved by BA in refinement 2026-10-21\n';

async function load(P){
 const hashes=async src=>Object.fromEntries(await Promise.all(Object.entries(src).map(async([p,t])=>[p,await P.hash(t)])));
 const files0=await hashes(SOURCES);
 // Record approvals exactly as the agent would: basis copied from the readiness report.
 const approve=async(s,files=files0)=>{const r=await P.readiness(s,{request:'x',draft:null,refined:null,files},PBI);
  for(const k of ['poba','technical','user'])s.approvals[k]={status:'approved',by:'Named reviewer ('+k+')',at:'2026-10-23',evidence:'Stated in chat 2026-10-23',basis:r.review[k].basis};return s;};
 const ready=await approve(base());
 // c(name, mutate, {rebind, docStatus, docs, sources}): rebind re-approves after the change, as for a reviewed update.
 const out=[];
 const c=async(name,fn,o={})=>{const s=clone(ready);let src={...SOURCES,...(o.sources||{})};for(const k of o.drop||[])delete src[k];
  if(fn)fn(s);if(o.rebind)await approve(s,await hashes(src));
  const status=o.docStatus??s.status,d={request:'# Original PBI request\n',draft:doc(status,s),refined:null,decisionLog:LOG,...(o.docs?o.docs(s,status):{})};
  out.push({name,state:s,sources:src,docs:{...d,files:await hashes(src)},expect:o.expect,codes:o.codes,refs:o.refs||[]});};
 const pending=s=>{for(const k of ['poba','technical','user'])s.approvals[k]={status:'pending'};s.status='Ready for Review';};
 const OVER=['STATUS_OVERCLAIMED'],STALE3=['APPROVAL_STALE','APPROVAL_STALE','APPROVAL_STALE'];
 await c('fully approved PBI may be finalized',null,{docs:(s,st)=>({refined:doc(st,s),draft:null}),expect:'Development-Ready',codes:[]});
 await c('whitespace-only reformatting keeps approvals valid',s=>{s.rules[0].rule='  Released formulas cannot change\n status back to   Draft ';},{expect:'Development-Ready',codes:[]});
 // The four reported 3.0.0 gaps, each the only defect.
 await c('gap 1: approved rule text changed without a rev change',s=>{s.rules[0].rule='Released formulas may change back to Draft when the PO allows it';},{expect:'Ready for Review',codes:[...STALE3,...OVER],refs:['poba: changed BR-1','technical: changed BR-1','user: changed BR-1']});
 await c('gap 2: final document with only a status line and IDs',null,{docs:(s,st)=>({refined:doc(st,s,'BR-1 BR-2 AC-1 AC-2 AC-3 AC-4 AC-5 AC-6 AC-7 DEP-1'),draft:null}),expect:'Ready for Review',
  codes:['DOC_CONTENT_MISMATCH','DOC_CONTENT_MISMATCH','DOC_CONTENT_MISMATCH','DOC_CONTENT_MISMATCH','DOC_CONTENT_MISMATCH','DOC_CONTENT_MISMATCH','DOC_CONTENT_MISMATCH','DOC_CONTENT_MISMATCH','DOC_CONTENT_MISMATCH','FINAL_WITHOUT_APPROVAL','STATUS_OVERCLAIMED']});
 await c('gap 3: DAB path omitted for a rule',s=>{delete s.rules[0].paths.dab;},{rebind:true,expect:'Needs Evidence',codes:['PATH_UNKNOWN',...OVER],refs:['BR-1/dab']});
 await c('gap 4: rule cites an evidence ID with no record',s=>{s.rules[0].evidence=['EV-1','EV-2','EV-404'];},{rebind:true,expect:'Needs Evidence',codes:['EVIDENCE_UNKNOWN',...OVER],refs:['BR-1/EV-404']});
 // Approval binding: additions, removals and scope.
 await c('added criterion after approval',s=>{s.acceptanceCriteria.push({id:'AC-8',rev:1,rules:['BR-2'],type:'boundary',criterion:'Given a name with trailing spaces, when saved, then the spaces are ignored'});},{expect:'Ready for Review',codes:[...STALE3,...OVER],refs:['poba: added AC-8','technical: added AC-8','user: added AC-8']});
 await c('removed criterion after approval',s=>{s.acceptanceCriteria.pop();},{expect:'Ready for Review',codes:[...STALE3,...OVER],refs:['poba: removed AC-7','technical: removed AC-7','user: removed AC-7']});
 await c('dependency change invalidates technical and final user approval only',s=>{s.dependencies[0].responsibility='Add status validation to create and update';},{expect:'Ready for Review',codes:['APPROVAL_STALE','APPROVAL_STALE',...OVER],refs:['technical: changed DEP-1','user: changed DEP-1']});
 await c('decision change invalidates PO/BA and final user approval only',s=>{s.decisions[0].evidence='PO in refinement 2026-10-24';},{expect:'Ready for Review',codes:['APPROVAL_STALE','APPROVAL_STALE',...OVER],refs:['poba: changed DEC-1','user: changed DEC-1']});
 await c('3.0.0 revision-number approvals are unbound',s=>{for(const k in s.approvals)s.approvals[k].basis={'BR-1':1,'BR-2':1};},{expect:'Ready for Review',codes:['APPROVAL_UNBOUND','APPROVAL_UNBOUND','APPROVAL_UNBOUND',...OVER]});
 await c('approval without evidence is incomplete',s=>{s.approvals.user.evidence='';},{expect:'Ready for Review',codes:['APPROVAL_PENDING',...OVER]});
 await c('pending approvals block finalization and REFINED-PBI.md',pending,{docs:(s,st)=>({refined:doc(st,s)}),expect:'Ready for Review',codes:['APPROVAL_PENDING','FINAL_WITHOUT_APPROVAL']});
 // Ownership, paths and evidence levels.
 await c('plugin code present but registration missing cannot be reused',s=>{s.rules[0].registration='missing';s.rules[0].targetAction='reuse';s.status='Draft';},{rebind:true,expect:'Needs Evidence',codes:['REUSE_NOT_ENFORCED']});
 await c('plugin registration not yet established needs evidence',s=>{s.rules[0].registration='unknown';s.status='Draft';},{rebind:true,expect:'Needs Evidence',codes:['REGISTRATION_UNKNOWN']});
 await c('disabled plugin recorded with an implement action is consistent',s=>{s.rules[0].registration='disabled';s.rules[0].targetAction='implement';},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('active plugin reached by CDMS may be reused when DAB does not apply',s=>{s.paths.dab={applies:false,reason:'Formulas are not written through DAB'};delete s.rules[0].paths.dab;delete s.rules[1].paths.dab;s.rules[0].targetAction='reuse';},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('DAB path bypassing CRM enforcement cannot be marked reuse',s=>{s.rules[0].targetAction='reuse';},{rebind:true,expect:'Needs Evidence',codes:['REUSE_NOT_ENFORCED',...OVER]});
 await c('unknown DAB path needs evidence',s=>{s.rules[0].paths.dab={status:'unknown'};},{rebind:true,expect:'Needs Evidence',codes:['PATH_UNKNOWN',...OVER]});
 await c('rule-level not-applicable path needs a reason',s=>{s.rules[1].paths.dab={status:'not-applicable'};},{rebind:true,expect:'Needs Evidence',codes:['PATH_UNKNOWN',...OVER],refs:['BR-2/dab']});
 await c('PBI scope must record DAB',s=>{delete s.paths.dab;},{rebind:true,expect:'Needs Evidence',codes:['PATH_SCOPE_MISSING','PATH_CONFLICT','PATH_CONFLICT',...OVER],refs:['dab','BR-1/dab','BR-2/dab']});
 await c('path ruled out needs a reason',s=>{s.paths.ocp={applies:false};},{rebind:true,expect:'Needs Evidence',codes:['PATH_SCOPE_MISSING',...OVER],refs:['ocp']});
 await c('reach claimed without reach-level evidence',s=>{s.rules[0].paths.cdms.evidence=['EV-1'];},{rebind:true,expect:'Needs Evidence',codes:['LEVEL_EVIDENCE_MISSING',...OVER],refs:['BR-1/cdms']});
 await c('runtime verified without runtime evidence',s=>{s.rules[0].runtime='verified';},{rebind:true,expect:'Needs Evidence',codes:['LEVEL_EVIDENCE_MISSING',...OVER],refs:['BR-1/runtime']});
 await c('active registration without registration evidence',s=>{s.rules[0].evidence=['EV-1'];},{rebind:true,expect:'Needs Evidence',codes:['LEVEL_EVIDENCE_MISSING',...OVER],refs:['BR-1/registration']});
 await c('external evidence without a revision is incomplete',s=>{s.evidence[3].revision=' ';},{rebind:true,expect:'Needs Evidence',codes:['EVIDENCE_INCOMPLETE',...OVER],refs:['EV-4']});
 await c('local evidence file deleted after approval',null,{drop:['src/Plugins/FormulaStatusPlugin.cs'],expect:'Needs Evidence',codes:['EVIDENCE_SOURCE_MISSING','APPROVAL_STALE','APPROVAL_STALE',...OVER],refs:['EV-1','technical: changed EV-1','user: changed EV-1']});
 await c('local evidence changed after approval',null,{sources:{'src/Validation/Formula Validator ಕ.cs':'public class FormulaValidator { /* name unique per tenant */ }\n'},expect:'Ready for Review',codes:['APPROVAL_STALE','APPROVAL_STALE',...OVER],refs:['technical: changed EV-5','user: changed EV-5']});
 await c('recorded evidence fingerprint no longer matches',s=>{s.evidence[0].sha256='0'.repeat(64);},{rebind:true,expect:'Needs Evidence',codes:['EVIDENCE_CHANGED',...OVER]});
 await c('evidence path that Windows would alias is rejected',s=>{s.evidence[0].source='src/Plugins/FormulaStatusPlugin.cs.';s.evidence[1].source='deploy/NUL.xml';},{rebind:true,expect:'Needs Evidence',codes:['EVIDENCE_INCOMPLETE','EVIDENCE_INCOMPLETE',...OVER]});
 await c('evidence marked stale',s=>{s.evidence[1].stale=true;},{rebind:true,expect:'Needs Evidence',codes:['EVIDENCE_STALE',...OVER]});
 await c('unknown execution identity needs evidence',s=>{s.actors[1].identity='unknown';s.status='Needs Evidence';},{rebind:true,expect:'Needs Evidence',codes:['IDENTITY_UNKNOWN']});
 await c('actor without unauthorized behavior is a draft',s=>{delete s.actors[0].unauthorizedBehavior;s.status='Draft';},{rebind:true,expect:'Draft',codes:['ACTOR_INCOMPLETE']});
 // Content, decisions, questions and dependencies.
 await c('placeholder rule text is a draft',s=>{s.rules[1].rule='TBD';s.status='Draft';},{rebind:true,expect:'Draft',codes:['CONTENT_MISSING']});
 await c('rule text too short to review is a draft',s=>{s.rules[1].rule='Unique name';s.status='Draft';},{rebind:true,expect:'Draft',codes:['CONTENT_MISSING']});
 await c('criterion without text is a draft',s=>{delete s.acceptanceCriteria[0].criterion;s.status='Draft';},{rebind:true,expect:'Draft',codes:['CONTENT_MISSING']});
 await c('document text differs from state',null,{docs:(s,st)=>({draft:doc(st,s).replace('within its business unit','across all business units')}),expect:'Ready for Review',codes:['DOC_CONTENT_MISMATCH',...OVER],refs:['BR-2']});
 await c('document status and IDs must match state',null,{docStatus:'Draft',docs:(s,st)=>({draft:doc(st,s).replace(/\| AC-[3-7] \|/g,'| x |').replace('DEP-1','')}),expect:'Ready for Review',codes:['DOC_STATUS_MISMATCH','DOC_MISSING_ID','DOC_MISSING_ID','DOC_MISSING_ID','DOC_MISSING_ID','DOC_MISSING_ID','DOC_MISSING_ID',...OVER]});
 await c('decision copied from another PBI is not valid here',s=>{s.decisions[0].pbi='pbi-111-other';pending(s);},{expect:'Awaiting PO/BA Decision',codes:['FOREIGN_DECISION','APPROVAL_PENDING',...OVER]});
 await c('decision missing from DECISION-LOG.md',null,{docs:()=>({decisionLog:'DEC-1 only'}),expect:'Ready for Review',codes:['DECISION_NOT_LOGGED',...OVER],refs:['DEC-2']});
 await c('decision superseding an unknown decision',s=>{s.decisions[1].supersedes='DEC-0';},{rebind:true,expect:'Awaiting PO/BA Decision',codes:['DECISION_SUPERSEDES_INVALID',...OVER]});
 await c('open blocking PO/BA question awaits decision',s=>{s.questions[0].status='open';s.status='Awaiting PO/BA Decision';},{rebind:true,expect:'Awaiting PO/BA Decision',codes:['BLOCKING_QUESTION']});
 await c('resolved PO/BA question needs an approved decision',s=>{s.questions[0].decisionRef='';},{rebind:true,expect:'Awaiting PO/BA Decision',codes:['QUESTION_UNSUPPORTED',...OVER]});
 await c('resolved technical question needs a resolution',s=>{s.questions.push({id:'Q-2',blocking:true,owner:'technical',status:'resolved',question:'Does DAB call the plugin?'});},{rebind:true,expect:'Needs Evidence',codes:['QUESTION_UNSUPPORTED',...OVER]});
 // 4.0: question engine statuses, duplicates and evidence scope.
 await c('question answered in the question panel counts as resolved',s=>{s.questions[0].status='answered';},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('deferred blocking PO/BA question stays open',s=>{s.questions[0].status='deferred';},{rebind:true,expect:'Awaiting PO/BA Decision',codes:['BLOCKING_QUESTION',...OVER]});
 await c('unknown question status is treated as open',s=>{s.questions[0].status='done';},{rebind:true,expect:'Awaiting PO/BA Decision',codes:['BLOCKING_QUESTION',...OVER]});
 await c('not-applicable PO/BA question needs a reason, not a decision',s=>{Object.assign(s.questions[0],{status:'not-applicable',resolution:'Released formulas are out of scope',decisionRef:''});},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('the same question recorded twice',s=>{s.questions.push({id:'Q-2',blocking:false,owner:'po-ba',status:'unanswered',question:' May a Released formula  return to Draft? '});},{rebind:true,expect:'Ready for Review',codes:['QUESTION_DUPLICATE',...OVER],refs:['Q-2']});
 await c('a superseded duplicate is ignored',s=>{s.questions.push({id:'Q-2',blocking:true,owner:'po-ba',status:'superseded',question:'May a Released formula return to Draft?'});},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('legacy CRM evidence cannot prove what DAB does',s=>{s.evidence[3].system='legacy-crm';},{rebind:true,expect:'Needs Evidence',codes:['LEGACY_NOT_TARGET_EVIDENCE','LEVEL_EVIDENCE_MISSING',...OVER],refs:['BR-1/dab/EV-4','BR-1/dab']});
 await c('legacy CRM evidence is valid for the CDMS path',s=>{s.evidence[2].system='legacy-crm';s.evidence[0].system='cdms';},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('evidence excluded by the recorded scope decision (PBI 305915 direction)',s=>{s.evidenceScope={exclude:['legacy-crm'],decisionRef:'DEC-3'};s.decisions.push({id:'DEC-3',pbi:PBI,status:'approved',evidence:'User direction in chat 2026-10-25: exclude legacy plugins from DAB analysis',supersedes:''});s.evidence[0].system='legacy-crm';},
  {rebind:true,docs:()=>({decisionLog:LOG+'DEC-3 exclude legacy plugin evidence\n'}),expect:'Needs Evidence',codes:['EVIDENCE_OUT_OF_SCOPE','NO_EVIDENCE',...OVER],refs:['BR-1/EV-1']});
 await c('evidence scope exclusion without a decision',s=>{s.evidenceScope={exclude:['legacy-crm']};},{rebind:true,expect:'Awaiting PO/BA Decision',codes:['SCOPE_DECISION_MISSING',...OVER]});
 await c('unknown evidence system is incomplete',s=>{s.evidence[1].system='crm';},{rebind:true,expect:'Needs Evidence',codes:['EVIDENCE_INCOMPLETE',...OVER],refs:['EV-2']});
 // XRM workflow intelligence: owners are attributed to the component whose code proves them.
 const wf=(s,type,comp,reg='active')=>{s.rules[0].owner={type,component:'Set Historic status'};s.rules[0].registration=reg;s.evidence[0].component=comp;};
 await c('classic workflow owner backed by workflow code and activation',s=>wf(s,'workflow','workflow'),{rebind:true,expect:'Development-Ready',codes:[]});
 await c('workflow rule cited only with plugin code is misattributed',s=>wf(s,'workflow','plugin'),{rebind:true,expect:'Needs Evidence',codes:['OWNER_MISATTRIBUTED',...OVER],refs:['BR-1/workflow']});
 await c('workflow without activation evidence stays unverified',s=>wf(s,'workflow','workflow','unknown'),{rebind:true,expect:'Needs Evidence',codes:['REGISTRATION_UNKNOWN',...OVER]});
 await c('custom workflow activity needs activation like a plugin',s=>wf(s,'custom-activity','custom-activity','unknown'),{rebind:true,expect:'Needs Evidence',codes:['REGISTRATION_UNKNOWN',...OVER]});
 await c('multiple owners need code evidence from each component',s=>{s.rules[0].owner={type:'multiple',types:['plugin','workflow']};s.evidence[0].component='plugin';},{rebind:true,expect:'Needs Evidence',codes:['OWNER_MISATTRIBUTED',...OVER],refs:['BR-1/workflow']});
 await c('multiple owners backed by plugin and workflow code',s=>{s.rules[0].owner={type:'multiple',types:['plugin','workflow']};s.evidence[0].component='plugin';s.evidence.push({id:'EV-7',level:'code',kind:'repo-file',source:'Workflows/SetHistoric.xaml',location:'SetEntityProperty statuscode, lines 1-3',summary:'Workflow sets Historic',component:'workflow'});s.rules[0].evidence.push('EV-7');},
  {rebind:true,sources:{'Workflows/SetHistoric.xaml':'<Activity x:Class="SetHistoric">\n  <SetEntityProperty Attribute="statuscode" Value="Historic"/>\n</Activity>\n'},expect:'Development-Ready',codes:[]});
 await c('multiple owners with one type is incomplete',s=>{s.rules[0].owner={type:'multiple',types:['plugin']};s.status='Draft';},{rebind:true,expect:'Draft',codes:['RULE_INCOMPLETE'],refs:['BR-1']});
 await c('unknown owner blocks Development-Ready',s=>{s.rules[1].owner={type:'unknown'};},{rebind:true,expect:'Needs Evidence',codes:['OWNER_UNKNOWN',...OVER],refs:['BR-2']});
 await c('unknown evidence component is incomplete',s=>{s.evidence[1].component='flow';},{rebind:true,expect:'Needs Evidence',codes:['EVIDENCE_INCOMPLETE',...OVER],refs:['EV-2']});
 // CDMS/DAB ownership: DAB implements every rule in its own code; one canonical rule per outcome.
 await c('CDMS reuses the plugin while DAB implements the rule itself',s=>{s.rules[0].targetAction='reuse';s.rules[0].dab={layer:'handler',status:'missing'};},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('reuse without DAB ownership is not enforced on the bypassed DAB path',s=>{s.rules[0].targetAction='reuse';},{rebind:true,expect:'Needs Evidence',codes:['REUSE_NOT_ENFORCED',...OVER],refs:['BR-1']});
 await c('DAB rule assigned to a plugin is rejected',s=>{s.rules[0].dab={layer:'CRM plugin',status:'missing'};},{rebind:true,expect:'Needs Evidence',codes:['DAB_PLUGIN_ASSIGNED',...OVER],refs:['BR-1']});
 await c('missing DAB behavior assigned to an application handler',s=>{s.rules[0].dab={layer:'handler',status:'missing'};s.rules[1].dab={layer:'validator',status:'implemented'};},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('DAB ownership without a status is invalid',s=>{s.rules[0].dab={layer:'validator'};},{rebind:true,expect:'Needs Evidence',codes:['DAB_OWNER_INVALID',...OVER],refs:['BR-1']});
 await c('DAB not-applicable needs a reason',s=>{s.rules[0].dab={status:'not-applicable'};s.rules[1].dab={status:'not-applicable',reason:'Form layout only'};},{rebind:true,expect:'Needs Evidence',codes:['DAB_OWNER_INVALID',...OVER],refs:['BR-1']});
 await c('the same rule recorded twice from different sources',s=>{s.rules[1].rule=s.rules[0].rule;},{rebind:true,expect:'Ready for Review',codes:['RULE_DUPLICATE',...OVER],refs:['BR-2']});
 await c('JavaScript and web resource evidence components are accepted',s=>{s.evidence[4].component='javascript';s.rules[1].owner={type:'multiple',types:['ui','application']};},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('approved PBI may have CDMS and DAB final documents',null,{docs:(s,st)=>({refined:doc(st,s),cdmsRefined:doc(st,s),dabRefined:doc(st,s)}),expect:'Development-Ready',codes:[]});
 await c('application PBI before approval is blocked',pending,{docs:(s,st)=>({dabRefined:doc(st,s)}),expect:'Ready for Review',codes:['APPROVAL_PENDING','FINAL_WITHOUT_APPROVAL'],refs:['Refined-PBI-DAB.md']});
 await c('application PBI missing a rule',null,{docs:(s,st)=>({cdmsRefined:doc(st,{...s,rules:s.rules.slice(0,1)})}),expect:'Ready for Review',codes:['DOC_MISSING_ID','FINAL_WITHOUT_APPROVAL','STATUS_OVERCLAIMED'],refs:['Refined-PBI-CDMS.md/BR-2','Refined-PBI-CDMS.md']});
 await c('DAB PBI for a CDMS-only PBI',s=>{s.paths.dab={applies:false,reason:'CDMS only'};for(const r of s.rules)delete r.paths.dab;},{rebind:true,docs:(s,st)=>({dabRefined:doc(st,s)}),expect:'Ready for Review',codes:['DOC_OUT_OF_SCOPE','FINAL_WITHOUT_APPROVAL','STATUS_OVERCLAIMED'],refs:['Refined-PBI-DAB.md']});
 // 5.0: one required approval; development targets decide which paths are required and which may not apply.
 await c('PO/BA and technical approvals are optional; only the final user approval is required',s=>{s.approvals.poba={status:'pending'};s.approvals.technical={status:'pending'};},{expect:'Development-Ready',codes:[]});
 const cdmsOnly=s=>{s.paths.dab={applies:false,reason:'Development target CDMS + UI'};s.paths.ui={applies:false,reason:'Requirement: no UI changes in this PBI'};for(const r of s.rules)delete r.paths.dab;};
 await c('CDMS + UI target requires the UI path and excludes DAB work',null,{docs:()=>({application:'cdms'}),expect:'Needs Evidence',codes:['PATH_SCOPE_MISSING','TARGET_SCOPE_CONFLICT',...OVER],refs:['ui','dab']});
 await c('CDMS + UI target with UI excluded by the requirement',cdmsOnly,{rebind:true,docs:()=>({application:'cdms'}),expect:'Development-Ready',codes:[]});
 await c('UI PBI for a target whose UI path does not apply',cdmsOnly,{rebind:true,docs:(s,st)=>({application:'cdms',uiRefined:doc(st,s)}),expect:'Ready for Review',codes:['DOC_OUT_OF_SCOPE','FINAL_WITHOUT_APPROVAL','STATUS_OVERCLAIMED'],refs:['Refined-PBI-UI.md']});
 await c('DAB + UI target: CDMS is a reference, never an applying path',s=>{s.paths.ui={applies:false,reason:'Requirement: no UI changes in this PBI'};},{rebind:true,docs:()=>({application:'dab'}),expect:'Awaiting PO/BA Decision',codes:['TARGET_SCOPE_CONFLICT',...OVER],refs:['cdms']});
 await c('a 4.1 PBI records its application without repositories: 4.x path rules',null,{docs:()=>({legacyApplication:'cdms'}),expect:'Development-Ready',codes:[]});
 await c('Both target requires the shared UI path',null,{docs:()=>({application:'both'}),expect:'Needs Evidence',codes:['PATH_SCOPE_MISSING',...OVER],refs:['ui']});
 // Branch completeness: a Yes branch covered by the plugin does not cover the No branch.
 const br=(s,y={},n={})=>{s.rules[0].branches=[{id:'BR-1.Y',condition:'User answers Yes',expected:'Status Actual; Master measurement replaced',cdms:'covered',dab:'missing',evidence:['EV-1'],acceptance:['AC-1','AC-2'],...y},
  {id:'BR-1.N',condition:'User answers No',expected:'Status Actual; Master measurement unchanged',cdms:'missing',dab:'missing',acceptance:['AC-3'],risk:'Activation may run the replacing plugin',...n}];};
 await c('branches tracked with an uncovered No path to implement',s=>{br(s);},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('reuse claimed while the No branch is missing in CDMS',s=>{br(s);s.rules[0].targetAction='reuse';s.rules[0].dab={layer:'handler',status:'missing'};},{rebind:true,expect:'Needs Evidence',codes:['BRANCH_NOT_COVERED',...OVER],refs:['BR-1.N/cdms']});
 await c('DAB marked implemented while a DAB branch is missing',s=>{br(s,{dab:'covered',evidence:['EV-1','EV-5']});s.rules[0].dab={layer:'handler',status:'implemented'};},{rebind:true,expect:'Needs Evidence',codes:['DAB_BRANCH_GAP',...OVER],refs:['BR-1.N']});
 await c('covered branch without code evidence',s=>{br(s,{evidence:[]});},{rebind:true,expect:'Needs Evidence',codes:['BRANCH_COVERAGE_UNPROVEN',...OVER],refs:['BR-1.Y/cdms']});
 await c('covered branch of a plugin without activation evidence',s=>{br(s);s.rules[0].registration='unknown';s.rules[0].evidence=['EV-1'];},{rebind:true,expect:'Needs Evidence',codes:['REGISTRATION_UNKNOWN','BRANCH_COVERAGE_UNPROVEN',...OVER],refs:['BR-1.Y/cdms']});
 await c('legacy code cannot cover a DAB branch',s=>{br(s,{dab:'covered'});s.evidence[0].system='legacy-crm';},{rebind:true,expect:'Needs Evidence',codes:['BRANCH_COVERAGE_UNPROVEN',...OVER],refs:['BR-1.Y/dab']});
 await c('incomplete branches are drafts',s=>{br(s,{expected:''},{acceptance:['AC-5']});s.status='Draft';},{rebind:true,expect:'Draft',codes:['BRANCH_INCOMPLETE','BRANCH_INCOMPLETE'],refs:['BR-1.Y','BR-1.N']});
 await c('conflicting branch needs its risk',s=>{br(s,{},{cdms:'conflicting',risk:''});s.status='Draft';},{rebind:true,expect:'Draft',codes:['BRANCH_INCOMPLETE'],refs:['BR-1.N']});
 // Evidence priority: bundled historical reports are navigation aids, never proof.
 const REF='playbook/pbi-builder/references/CRM-END-TO-END-TECHNICAL-ANALYSIS.md',refSrc={[REF]:'# CRM analysis\nPS-09 PaintSystemValidator.cs:118\n'};
 await c('historical report alone does not prove a rule',s=>{Object.assign(s.evidence[0],{source:REF,location:'PS-09 row'});},{rebind:true,sources:refSrc,expect:'Needs Evidence',codes:['NO_EVIDENCE','HISTORICAL_NOT_PROOF',...OVER],refs:['BR-1']});
 await c('historical report beside current source is supporting context',s=>{s.evidence.push({id:'EV-7',level:'code',kind:'repo-file',source:REF,location:'PS-09 row',summary:'Earlier analysis of the same rule'});s.rules[0].evidence.push('EV-7');},{rebind:true,sources:refSrc,expect:'Development-Ready',codes:[]});
 // Each PBI starts fresh: another PBI's files never count as evidence.
 await c('evidence from another PBI folder is rejected and does not count',s=>{Object.assign(s.evidence[2],{source:'playbook/pbis/pbi-277355-other/DRAFT-PBI.md'});},{rebind:true,sources:{'playbook/pbis/pbi-277355-other/DRAFT-PBI.md':'# Other PBI draft'},expect:'Needs Evidence',codes:['FOREIGN_PBI_EVIDENCE','LEVEL_EVIDENCE_MISSING',...OVER],refs:['EV-3','BR-1/cdms']});
 await c('attachment in this PBI folder is valid evidence',s=>{Object.assign(s.evidence[2],{source:'playbook/pbis/'+PBI+'/attachments/spec.md'});},{rebind:true,sources:{['playbook/pbis/'+PBI+'/attachments/spec.md']:'Released formulas stay Released'},expect:'Development-Ready',codes:[]});
 await c('evidence flagged historical does not count',s=>{s.evidence[2].historical=true;},{rebind:true,expect:'Needs Evidence',codes:['LEVEL_EVIDENCE_MISSING',...OVER],refs:['BR-1/cdms']});
 await c('rule links an unknown dependency',s=>{s.rules[0].dependencies=['DEP-9'];s.status='Draft';},{rebind:true,expect:'Draft',codes:['DEPENDENCY_UNKNOWN']});
 await c('rule without negative coverage is a draft',s=>{s.acceptanceCriteria=s.acceptanceCriteria.filter(a=>a.id!=='AC-6');s.status='Draft';},{rebind:true,expect:'Draft',codes:['MISSING_COVERAGE']});
 await c('state of another PBI folder is rejected',s=>{s.pbi='pbi-999-elsewhere';},{expect:'Draft',codes:['STATE_PBI_MISMATCH',...OVER]});
 await c('missing state is a draft',s=>null,{expect:'Draft',codes:['STATE_MISSING']});
 out.at(-1).state=null;
 await c('unsupported schema is a draft',null,{expect:'Draft',codes:['STATE_SCHEMA']});
 out.at(-1).state={schemaVersion:3};
 await c('malformed records are drafts, not crashes',s=>{s.rules.push('oops',{id:'BR-1',rev:'1'});s.acceptanceCriteria.push({id:'AC-9',rev:1,type:'odd',rules:[]});s.evidence.push(7);s.questions=[null];s.paths.cdms='yes';s.approvals=null;s.status='Draft';},
  {expect:'Draft',codes:['DUPLICATE_ID','PATH_SCOPE_MISSING','PATH_CONFLICT','PATH_CONFLICT','RULE_INCOMPLETE','RULE_INCOMPLETE','AC_INCOMPLETE','EVIDENCE_INCOMPLETE','APPROVAL_PENDING']});
 await c('unresolved gap without impact still blocks (compatible default)',s=>{s.rules[0].gaps=[{id:'GAP-1',description:'Plugin step enablement unknown',status:'open'}];},{rebind:true,expect:'Needs Evidence',codes:['EVIDENCE_GAP',...OVER],refs:['BR-1']});
 await c('WARNING and INFORMATIONAL gaps do not block readiness',s=>{s.rules[0].gaps=[{id:'GAP-1',description:'Historical audit trail side effect unverified',status:'open',impact:'INFORMATIONAL'},{id:'GAP-2',description:'Optional metadata sync unverified',status:'open',impact:'WARNING'}];},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('BLOCKING gap blocks beside a warning gap',s=>{s.rules[0].gaps=[{id:'GAP-1',description:'Registration unknown',status:'open',impact:'BLOCKING'},{id:'GAP-2',description:'Optional',status:'open',impact:'WARNING'}];},{rebind:true,expect:'Needs Evidence',codes:['EVIDENCE_GAP',...OVER],refs:['BR-1']});
 await c('unknown impact value is treated as BLOCKING',s=>{s.rules[0].gaps=[{id:'GAP-1',description:'Registration unknown',status:'open',impact:'LOW'}];},{rebind:true,expect:'Needs Evidence',codes:['EVIDENCE_GAP',...OVER],refs:['BR-1']});
 await c('resolved gaps are ignored whatever their impact',s=>{s.rules[0].gaps=[{id:'GAP-1',description:'Done',status:'resolved',impact:'BLOCKING'}];},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('ASSUMED evidence is not proof of an existing owner',s=>{s.evidence[0].verification='ASSUMED';},{rebind:true,expect:'Needs Evidence',codes:['NO_EVIDENCE',...OVER],refs:['BR-1']});
 await c('UNAVAILABLE reach evidence does not prove a path',s=>{s.evidence[2].verification='UNAVAILABLE';},{rebind:true,expect:'Needs Evidence',codes:['LEVEL_EVIDENCE_MISSING',...OVER],refs:['BR-1/cdms']});
 await c('explicit VERIFIED evidence is proof',s=>{for(const e of s.evidence)e.verification='VERIFIED';},{rebind:true,expect:'Development-Ready',codes:[]});
 await c('unknown verification value is incomplete evidence',s=>{s.evidence[0].verification='MAYBE';},{rebind:true,expect:'Needs Evidence',codes:['NO_EVIDENCE','EVIDENCE_INCOMPLETE',...OVER],refs:['BR-1','EV-1']});
 return {PBI,cases:out};
}
// Writes a case as real files: PBI documents, state and evidence sources (null documents are not written).
async function writeCase(P,root,folder,c){
 if(c.state!==null)await P.write(root,folder+'/pbi-state.json',JSON.stringify(c.state,null,2));
 for(const [k,f] of [['request','REQUEST.md'],['draft','DRAFT-PBI.md'],['refined','REFINED-PBI.md'],['cdmsRefined','PBI-CDMS.md'],['dabRefined','DAB-REFINED-PBI.md'],['uiRefined','Refined-PBI-UI.md'],['decisionLog','DECISION-LOG.md']])if(c.docs[k]!=null)await P.write(root,folder+'/'+f,c.docs[k]);
 if(c.docs.application)await P.write(root,folder+'/pbi.json',JSON.stringify({application:c.docs.application,repositories:[]}));
 if(c.docs.legacyApplication)await P.write(root,folder+'/pbi.json',JSON.stringify({application:c.docs.legacyApplication,references:[]}));
 for(const [p,t] of Object.entries(c.sources))await P.write(root,p,t);
}
module.exports={PBI,load,writeCase};
