'use strict';
// Configurable multi-repository workspace for end-to-end tests: one selected root that holds Legacy, CDMS, DAB and shared UI
// repositories (folder names and the feature are parameters), plus a pbi-state.json the "agent" would record for it.
// Nothing here names a person, a machine path or a real PBI.
const DEFAULTS={workspace:'Workspace Root ಕ',repos:{legacy:'Legacy Repo',cdms:'CDMS Repo',dab:'DAB Repo',ui:'UI Repo'},feature:'Measurement',entity:'measurement'};
const opts=o=>({...DEFAULTS,...o,repos:{...DEFAULTS.repos,...(o||{}).repos}});

function sourceFiles(o){
 const {repos:r,feature:F,entity:e}=opts(o),csproj=sdk=>'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>'+sdk+'</Project>';
 return {
  [r.legacy+'/Legacy.sln']:'Microsoft Visual Studio Solution File, Format Version 12.00\r\nProject("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Plugins", "Plugins\\Plugins.csproj", "{1}"\r\nEndProject\r\n',
  [r.legacy+'/Plugins/Plugins.csproj']:'<Project ToolsVersion="15.0"><PropertyGroup><TargetFrameworkVersion>v4.6.2</TargetFrameworkVersion></PropertyGroup><ItemGroup><Reference Include="Microsoft.Xrm.Sdk, Version=9.0.0.0" /></ItemGroup></Project>',
  [r.legacy+'/Plugins/'+F+'CreatePlugin.cs']:`public class ${F}CreatePlugin : IPlugin { public void Execute(IServiceProvider p) { /* rejects an invalid ${e} on Create */ } }\n`,
  [r.legacy+'/WebResources/'+e+'.js']:`function on${F}Save(ctx) { /* client-side ${e} validation */ }\n`,
  [r.cdms+'/Cdms.csproj']:csproj('<ItemGroup><PackageReference Include="MediatR" Version="12.0" /></ItemGroup>'),
  [r.cdms+'/Contracts/Create'+F+'Dto.cs']:`public record Create${F}Dto(string Name, decimal Value);\n`,
  [r.cdms+'/Handlers/Create'+F+'Handler.cs']:`public class Create${F}Handler { public Result Handle(Create${F}Dto dto) { /* validates ${e}, saves, returns result */ return Result.Ok; } }\n`,
  [r.cdms+'/Functions/'+F+'Functions.cs']:`public class ${F}Functions { /* HTTP trigger for Create${F}Handler */ }\n`,
  [r.dab+'/Dab.csproj']:csproj('<ItemGroup><PackageReference Include="Microsoft.Azure.Functions.Worker" Version="1.0" /><PackageReference Include="FluentValidation" Version="11.0" /></ItemGroup>'),
  [r.dab+'/Contracts/Create'+F+'Request.cs']:`public record Create${F}Request(Guid MetadataId, decimal Value);\n`,
  [r.dab+'/Handlers/Create'+F+'Handler.cs']:`public class Create${F}Handler { public Task<Guid> Handle(Create${F}Request request) { /* FluentValidation, persist, return id */ } }\n`,
  [r.dab+'/Program.cs']:'var host = new HostBuilder().Build();\n',
  [r.ui+'/angular.json']:'{"projects":{"app":{}}}',
  [r.ui+'/src/app/app.module.ts']:'export class AppModule {}\n',
  [r.ui+'/src/app/'+e+'/'+e+'.component.ts']:`export class ${F}Component { save() { this.service.create(this.model); } }\n`,
  [r.ui+'/src/app/'+e+'/'+e+'.service.ts']:`export class ${F}Service { create(m) { return this.http.post(environment.apiUrl + '/${e}', m); } }\n`,
  [r.ui+'/src/environments/environment.ts']:"export const environment = { apiUrl: 'https://cdms.example.test/api' };\n",
  [r.ui+'/node_modules/dep/index.js']:'module.exports = 1;\n',
  [r.ui+'/dist/main.js']:'/* build output */\n'};
}
async function build(fs,path,dir,o){
 const files=sourceFiles(o);await fs.mkdir(path.join(dir,'.git'),{recursive:true});
 for(const [p,t] of Object.entries(files)){await fs.mkdir(path.dirname(path.join(dir,p)),{recursive:true});await fs.writeFile(path.join(dir,p),t);}
 return files;
}
const configFor=o=>{const {repos:r}=opts(o);return {projectName:'Workspace',ide:'vscode',role:'other',includeReferences:false,sources:{legacy:r.legacy,cdms:r.cdms,dab:r.dab,ui:r.ui},others:[]};};

// What an agent records for a "both" PBI (CDMS + DAB + shared UI): evidence cites real files with their real SHA-256.
async function stateFor(P,o,pbi,files){
 const {repos:r,feature:F,entity:e}=opts(o),h=p=>P.hash(files[p]),ev=async(id,level,system,component,source,location,summary)=>({id,level,kind:'repo-file',source,location,summary,system,...(component?{component}:{}),sha256:await h(source)});
 const cdmsH=r.cdms+'/Handlers/Create'+F+'Handler.cs',dabH=r.dab+'/Handlers/Create'+F+'Handler.cs',uiC=r.ui+'/src/app/'+e+'/'+e+'.component.ts',legP=r.legacy+'/Plugins/'+F+'CreatePlugin.cs';
 const evidence=[await ev('EV-1','code','legacy-crm','plugin',legP,'Execute','Legacy plugin rejects an invalid '+e),await ev('EV-2','code','cdms','cdms-api',cdmsH,'Handle','CDMS handler validates and saves'),
  await ev('EV-3','code','dab','dab',dabH,'Handle','DAB handler validates with FluentValidation and saves'),await ev('EV-4','code','ui','javascript',uiC,'save','Shared UI component saves through the service'),
  await ev('EV-5','reach','cdms','cdms-api',r.cdms+'/Functions/'+F+'Functions.cs','HTTP trigger','CDMS function reaches the handler'),await ev('EV-6','reach','dab','dab',r.dab+'/Program.cs','host','DAB host registers the handlers'),
  await ev('EV-7','reach','ui','javascript',r.ui+'/src/app/'+e+'/'+e+'.service.ts','create','Shared UI posts to the configured API URL')];
 const paths={cdms:{status:'reaches',evidence:['EV-5']},dab:{status:'reaches',evidence:['EV-6']},ui:{status:'reaches',evidence:['EV-7']}},na=reason=>({status:'not-applicable',reason});
 return {schemaVersion:2,pbi,status:'Awaiting PO/BA Decision',paths:{cdms:{applies:true},dab:{applies:true},ui:{applies:true}},
  actors:[{id:'ACT-1',role:'Operator',permissions:'Create '+e,identity:'caller',unauthorizedBehavior:'The save is rejected with an access error'}],
  rules:[{id:'BR-1',rev:1,rule:'A '+e+' with an invalid value is rejected with a clear message',context:F+', create, all business units',owner:{type:'application',component:'Create'+F+'Handler'},evidence:['EV-1','EV-2','EV-3','EV-4'],paths,
    targetAction:'extend',decision:'confirmed',decisionRef:'DEC-1',coverage:['positive','negative'],
    gaps:[{id:'GAP-1',description:'The audit-trail side effect of the legacy plugin is not verified',status:'open',impact:'INFORMATIONAL'}],
    branches:[{id:'BR-1.Y',condition:'The value is valid',expected:'The '+e+' is saved',cdms:'covered',dab:'covered',ui:'covered',evidence:['EV-2','EV-3','EV-4'],acceptance:['AC-1']},
     {id:'BR-1.N',condition:'The value is invalid',expected:'The save is rejected with a clear message',cdms:'covered',dab:'partial',ui:'covered',evidence:['EV-2','EV-4'],acceptance:['AC-2']}]},
   {id:'BR-2',rev:1,rule:'The saved '+e+' shows which instrument measured it',context:F+', display',owner:{type:'application',component:F+'Component'},evidence:['EV-4'],
    paths:{cdms:na('Display only'),dab:na('Display only'),ui:{status:'reaches',evidence:['EV-7']}},targetAction:'implement',decision:'confirmed',decisionRef:'DEC-1',coverage:['positive','negative']}],
  acceptanceCriteria:[{id:'AC-1',rev:1,rules:['BR-1'],type:'positive',criterion:'Given a valid '+e+', when it is saved, then it is stored'},
   {id:'AC-2',rev:1,rules:['BR-1'],type:'negative',criterion:'Given an invalid value, when it is saved, then the save is rejected with a clear message'},
   {id:'AC-3',rev:1,rules:['BR-2'],type:'positive',criterion:'Given a saved '+e+', when it is shown, then the instrument is displayed'},
   {id:'AC-4',rev:1,rules:['BR-2'],type:'negative',criterion:'Given a '+e+' without an instrument, when it is shown, then a placeholder is displayed'}],
  evidence,
  questions:[
   {id:'Q-1',blocking:true,owner:'po-ba',status:'open',question:'Should an invalid value be rejected or corrected automatically?',options:[{key:'A',text:'Reject it with a clear message'},{key:'B',text:'Correct it automatically'}],
    recommended:'A',recommendationWhy:'Both backends already reject invalid values and return a message; the legacy plugin does the same.',recommendationEvidence:['EV-2','EV-3'],businessImpact:'Users see why a value was refused.',technicalImpact:'No new correction logic is needed.',evidence:['EV-2','EV-3']},
   {id:'Q-2',blocking:true,owner:'po-ba',status:'open',question:'Which business units does the rule apply to?',options:[{key:'A',text:'All business units'},{key:'B',text:'Only business units with a quality manager'}],evidence:['EV-2']},
   {id:'Q-3',blocking:true,owner:'po-ba',status:'open',question:'Is the instrument shown for historical '+e+'s too?',options:[{key:'A',text:'Yes, show it'},{key:'B',text:'No, only new records'}],evidence:['EV-4']}],
  assumptions:[],decisions:[{id:'DEC-1',pbi,status:'approved',evidence:'Stated in the original request (Description)',supersedes:''}],dependencies:[],
  feasibility:{status:'reviewed',evidence:'Handlers and shared UI inspected in the current checkout'},approvals:{poba:{status:'pending'},technical:{status:'pending'},user:{status:'pending'}},approvalHistory:[]};
}
const draftDoc=(state,status)=>['# '+state.pbi,'Status: '+status,'','## Business rules and exceptions','| ID | Rule |','| --- | --- |',...state.rules.map(x=>'| '+x.id+' | '+x.rule+' |'),'',
 '## Acceptance criteria','| ID | Criterion |','| --- | --- |',...state.acceptanceCriteria.map(x=>'| '+x.id+' | '+x.criterion+' |'),'','## Dependencies','None.',''].join('\n');
module.exports={DEFAULTS,opts,sourceFiles,build,configFor,stateFor,draftDoc};
