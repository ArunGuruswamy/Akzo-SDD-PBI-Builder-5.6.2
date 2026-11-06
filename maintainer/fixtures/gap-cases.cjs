'use strict';
// The four readiness gaps reported against 3.0.0, written exactly as a 3.0.0 agent would record them
// (pbi-state.json schemaVersion 1). Each one was accepted as Development-Ready by 3.0.0.
const PBI='pbi-300186-formula-status-20261027-ab12cd34';
function v300(){return {
 schemaVersion:1,pbi:PBI,status:'Development-Ready',
 actors:[{id:'ACT-1',role:'Regional formulator',permissions:'Formula editor, own BU',identity:'caller',unauthorizedBehavior:'Save rejected with access error'}],
 rules:[{id:'BR-1',rev:1,rule:'Released formulas cannot change status back to Draft',context:'Formula, update, Released',owner:{type:'plugin',component:'FormulaStatusPlugin'},
  registration:'active',paths:{cdms:'reaches',dab:'bypasses'},evidence:['EV-1'],targetAction:'extend',decision:'confirmed',decisionRef:'DEC-1',gaps:[]}],
 acceptanceCriteria:[{id:'AC-1',rev:1,rules:['BR-1'],type:'positive'},{id:'AC-2',rev:1,rules:['BR-1'],type:'negative'}],
 questions:[],assumptions:[],decisions:[{id:'DEC-1',pbi:PBI,status:'approved',evidence:'PO in chat 2026-10-20',supersedes:''}],
 dependencies:[],feasibility:{status:'reviewed',evidence:'Tech lead review 2026-10-22'},
 approvals:Object.fromEntries(['poba','technical','user'].map(k=>[k,{status:'approved',by:'Named reviewer',at:'2026-10-23',evidence:'Recorded in chat',basis:{'BR-1':1,'AC-1':1,'AC-2':1}}]))};}
const full='# PBI 300186\nStatus: Development-Ready\n\nBR-1 Released formulas cannot change status back to Draft\nAC-1 AC-2\n';
const docs=refined=>({request:'# Original PBI request\n',draft:null,refined,decisionLog:'DEC-1 approved'});
const change=fn=>{const s=v300();fn(s);return s;};
module.exports={PBI,cases:[
 {gap:1,name:'approved rule text changed without a rev change',state:change(s=>{s.rules[0].rule='Released formulas may change back to Draft when the PO allows it';}),docs:docs(full.replace('cannot change status back to Draft','may change back to Draft when the PO allows it'))},
 {gap:2,name:'final document with only a status line and IDs',state:v300(),docs:docs('Status: Development-Ready\nBR-1 AC-1 AC-2\n')},
 {gap:3,name:'DAB target path omitted',state:change(s=>{s.rules[0].paths={cdms:'reaches'};}),docs:docs(full)},
 {gap:4,name:'rule cites an evidence ID with no evidence record',state:change(s=>{s.rules[0].evidence=['EV-404'];}),docs:docs(full)},
].map(c=>({...c,sources:{}}))};
