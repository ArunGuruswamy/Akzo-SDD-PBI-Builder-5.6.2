'use strict';
const fs=require('node:fs'),path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'src',name),'utf8');
const assets=JSON.stringify({...JSON.parse(source('assets.json')),installer:fs.readFileSync(path.join(__dirname,'installer','Install-PBIBuilder.ps1'),'utf8')}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
const html=source('shell.html').replace('__ASSETS__',()=>assets).replace('__CORE__',()=>source('core.js')).replace('__UI__',()=>source('ui.js'));
fs.writeFileSync(path.join(__dirname,'Akzo-SDD-PBI-Builder.html'),html.replace(/\r\n/g,'\n'));
console.log('Built standalone HTML ('+Buffer.byteLength(html)+' bytes).');