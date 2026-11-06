'use strict';
// Node equivalent of update-fixture.py for machines without Python: rebuilds dom-fixture.json from src/shell.html.
const fs=require('node:fs'),path=require('node:path');
const root=__dirname,html=fs.readFileSync(path.join(root,'src/shell.html'),'utf8');
const unescape=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(m,e)=>{const k=e.toLowerCase();return k==='amp'?'&':k==='lt'?'<':k==='gt'?'>':k==='quot'?'"':k==='apos'?"'":k==='nbsp'?'\u00a0':k[1]==='x'?String.fromCodePoint(parseInt(k.slice(2),16)):String.fromCodePoint(parseInt(k.slice(1),10));});
const rows=[];let select=null,i=0;
while(i<html.length){
 if(html.startsWith('<!--',i)){const e=html.indexOf('-->',i);i=e<0?html.length:e+3;continue;}
 if(html[i]!=='<'||!/[A-Za-z\/!]/.test(html[i+1]||'')){i++;continue;}
 if(html[i+1]==='!'){const e=html.indexOf('>',i);i=e<0?html.length:e+1;continue;}
 if(html[i+1]==='/'){const m=/^<\/([A-Za-z0-9]+)\s*>/.exec(html.slice(i,i+80));if(m&&m[1].toLowerCase()==='select')select=null;const e=html.indexOf('>',i);i=e<0?html.length:e+1;continue;}
 const m=/^<([A-Za-z][A-Za-z0-9]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/.exec(html.slice(i,i+4000));
 if(!m){i++;continue;}
 const tag=m[1].toLowerCase(),a={};
 for(const x of m[2].matchAll(/([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))a[x[1].toLowerCase()]=x[2]!==undefined?unescape(x[2]):x[3]!==undefined?unescape(x[3]):x[4]!==undefined?unescape(x[4]):null;
 i+=m[0].length;
 if(a.id||tag==='button'||(a.class||'').split(/\s+/).includes('panel')){
  const r={tag,id:a.id||null,className:a.class||'',tab:a['data-tab']??null,value:a.value??'',checked:'checked' in a,text:''};
  if(a.id==='assets')r.text=fs.readFileSync(path.join(root,'src/assets.json'),'utf8');
  rows.push(r);if(tag==='select')select=r;}
 if(tag==='option'&&select&&(!select.value||'selected' in a))select.value=a.value??'';
 if(tag==='script'||tag==='style'){const e=html.indexOf('</'+tag,i);i=e<0?html.length:e;}
}
fs.writeFileSync(path.join(root,process.argv[2]||'dom-fixture.json'),JSON.stringify(rows),'utf8');
console.log('Wrote '+(process.argv[2]||'dom-fixture.json')+' ('+rows.length+' elements).');
