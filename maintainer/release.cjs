'use strict';
// Assembles the package root (one level up) and the release ZIP in releases/Akzo-SDD-PBI-Builder-<version>/, then verifies the ZIP
// by extracting it with PowerShell Expand-Archive and checking every SHA-256. Run after build.py and the tests.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const P=require('./src/core.js');
const pkg=path.resolve(__dirname,'..'),zipPath=path.join(pkg,'releases',`Akzo-SDD-PBI-Builder-${P.VERSION}`,`Akzo-SDD-PBI-Builder-${P.VERSION}.zip`);
const EXCLUDE=new Set(['maintainer/Akzo-SDD-PBI-Builder.html','maintainer/generated-test.zip','maintainer/generated-comparison.zip','SHA256SUMS.txt',
 'Microsoft/Windows/PowerShell/ModuleAnalysisCache',
 'docs/APPLICATION-PERFORMANCE-QUALITY-AUDIT-2026-11-01.md','docs/APPLICATION-PERFORMANCE-QUALITY-AUDIT-2026-11-01.docx','docs/MEASUREMENTS.md']);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function list(dir,rel=''){let out=[];for(const e of await fs.readdir(path.join(dir,rel),{withFileTypes:true})){const r=rel?rel+'/'+e.name:e.name;if(e.name==='.git'||r==='releases'||r==='Akzo-Pbi-Builder_old')continue;if(e.isDirectory())out=out.concat(await list(dir,r));else if(!EXCLUDE.has(r))out.push(r);}return out.sort();}
(async()=>{
 const assets=JSON.parse(await fs.readFile(path.join(__dirname,'src/assets.json'),'utf8'));
 await fs.copyFile(path.join(__dirname,'Akzo-SDD-PBI-Builder.html'),path.join(pkg,'Akzo-SDD-PBI-Builder.html'));
 await fs.writeFile(path.join(pkg,'pbi-builder-bundle.json'),JSON.stringify(P.bundle(assets)));
 for(const f of ['Install-PBIBuilder.ps1','Uninstall-PBIBuilder.ps1','PBI-Builder-Setup.ps1','Install-PBIBuilder.cmd','Uninstall-PBIBuilder.cmd','Install.cmd','Uninstall.cmd'])await fs.copyFile(path.join(__dirname,'installer',f),path.join(pkg,f));
 // Organization-signed package: set PBI_SIGN_CERT to the thumbprint of a code-signing certificate in
 // Cert:\CurrentUser\My (and optionally PBI_SIGN_TIMESTAMP to a timestamp URL). Signing runs before checksums.
 if(process.env.PBI_SIGN_CERT){
  const s=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','$c=Get-Item -LiteralPath (\'Cert:\\CurrentUser\\My\\\'+$env:PBI_SIGN_CERT);foreach($f in \'Install-PBIBuilder.ps1\',\'Uninstall-PBIBuilder.ps1\',\'PBI-Builder-Setup.ps1\'){$a=@{FilePath=(Join-Path $env:PKG $f);Certificate=$c;HashAlgorithm=\'SHA256\'};if($env:PBI_SIGN_TIMESTAMP){$a.TimestampServer=$env:PBI_SIGN_TIMESTAMP};$r=Set-AuthenticodeSignature @a;if($r.Status -ne \'Valid\'){throw ($f+\': \'+$r.StatusMessage)}}'],{encoding:'utf8',env:{...process.env,PKG:pkg}});
  if(s.status!==0)throw Error('Signing failed: '+s.stderr);console.log('Signed the PowerShell scripts with certificate '+process.env.PBI_SIGN_CERT);
 }
 const packageFiles=await list(pkg);
 if(packageFiles.some(rel=>rel==='Akzo-Pbi-Builder_old'||rel.startsWith('Akzo-Pbi-Builder_old/')))throw Error('The historical checkout must not be included in the release.');
 const files={},sums=[];
 for(const rel of packageFiles){const b=await fs.readFile(path.join(pkg,rel));files['Akzo-SDD-PBI-Builder/'+rel]=new Uint8Array(b);sums.push(sha(b)+'  '+rel);}
 const sumText=sums.join('\n')+'\n';files['Akzo-SDD-PBI-Builder/SHA256SUMS.txt']=sumText;await fs.writeFile(path.join(pkg,'SHA256SUMS.txt'),sumText);
 const zip=Buffer.from(await P.zip(files).arrayBuffer());await fs.mkdir(path.dirname(zipPath),{recursive:true});await fs.writeFile(zipPath,zip);await fs.writeFile(zipPath+'.sha256',sha(zip)+'  '+path.basename(zipPath)+'\n');
 // Independent check: a different ZIP reader must reproduce every file and checksum.
 const out=await fs.mkdtemp(path.join(os.tmpdir(),'akzo-release-'));
 const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:ZIP -DestinationPath $env:OUT'],{encoding:'utf8',env:{...process.env,ZIP:zipPath,OUT:out}});
 if(r.status!==0)throw Error('Expand-Archive failed: '+r.stderr);
 const root=path.join(out,'Akzo-SDD-PBI-Builder');let checked=0;
 for(const line of (await fs.readFile(path.join(root,'SHA256SUMS.txt'),'utf8')).trim().split('\n')){const [h,rel]=line.split('  ');if(sha(await fs.readFile(path.join(root,rel)))!==h)throw Error('Checksum mismatch after extraction: '+rel);checked++;}
 if(checked!==Object.keys(files).length-1)throw Error('File count mismatch after extraction');
 await fs.rm(out,{recursive:true,force:true});
 console.log(`Release ${zipPath}\n${Object.keys(files).length} files, ${zip.length} bytes, SHA-256 ${sha(zip)}\nVerified: Expand-Archive extracted all files and all ${checked} SHA-256 checksums match.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
