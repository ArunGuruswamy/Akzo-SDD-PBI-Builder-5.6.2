'use strict';
// File System Access API handles backed by real files, for Node tests.
const fs=require('node:fs/promises'),path=require('node:path');
function browserError(e){if(e.code==='ENOENT')e.name='NotFoundError';else if(['ENOTDIR','EISDIR'].includes(e.code))e.name='TypeMismatchError';return e;}
class FileHandle{
 constructor(p){this.path=p;this.kind='file';this.name=path.basename(p);}
 async getFile(){try{const b=await fs.readFile(this.path),st=await fs.stat(this.path);return{size:b.length,lastModified:Math.floor(st.mtimeMs),slice:(s,e)=>({text:async()=>new TextDecoder().decode(b.subarray(s,e))}),text:async()=>new TextDecoder().decode(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}}catch(e){throw browserError(e)}}
 async createWritable(){const p=this.path;let txt;return{write:async text=>{txt=text},close:async()=>fs.writeFile(p,txt,'utf8'),abort:async()=>{}};}
}
class DirectoryHandle{
 constructor(p){this.path=p;this.kind='directory';this.name=path.basename(p);}
 async getDirectoryHandle(name,{create=false}={}){const p=path.join(this.path,name);try{if(create)await fs.mkdir(p,{recursive:false}).catch(e=>{if(e.code!=='EEXIST')throw e;});if(!(await fs.stat(p)).isDirectory()){const e=Error('Not a directory');e.code='ENOTDIR';throw e;}return new DirectoryHandle(p)}catch(e){throw browserError(e)}}
 async getFileHandle(name,{create=false}={}){const p=path.join(this.path,name);try{if(create){const h=await fs.open(p,'a');await h.close();}if(!(await fs.stat(p)).isFile()){const e=Error('Not a file');e.code='EISDIR';throw e;}return new FileHandle(p)}catch(e){throw browserError(e)}}
 async removeEntry(name){try{await fs.unlink(path.join(this.path,name))}catch(e){throw browserError(e)}}
 async *entries(){for(const e of await fs.readdir(this.path,{withFileTypes:true})){yield[e.name,e.isDirectory()?new DirectoryHandle(path.join(this.path,e.name)):new FileHandle(path.join(this.path,e.name))];}}
}
module.exports={FileHandle,DirectoryHandle};
