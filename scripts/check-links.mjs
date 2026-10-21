/** Checks built HTML internal links and local image/script/stylesheet paths. */
import {readdir,stat,readFile} from 'node:fs/promises';
import {join,resolve,dirname,extname} from 'node:path';
const root=resolve('dist');let files=[];let missing=[];
async function walk(path){for(const e of await readdir(path,{withFileTypes:true})){const f=join(path,e.name);if(e.isDirectory())await walk(f);else if(e.name.endsWith('.html'))files.push(f)}}
try{await walk(root)}catch(e){console.error('Run astro build first: dist/ missing');process.exit(1)}
const {existsSync}=await import('node:fs');
for(const file of files){const txt=await readFile(file,'utf8');for(const match of txt.matchAll(/(?:href|src)=["']([^"']+)["']/g)){
 const path=match[1];if(/^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(path))continue;
 const clean=path.split(/[?#]/)[0];if(!clean)continue;
 const target=clean.startsWith('/')?join(root,clean.slice(1)):resolve(dirname(file),clean);
 const possibilities=[target,join(target,'index.html'),target+'.html'];
 if(!possibilities.some(p=>existsSync(p)))missing.push(`${file.replace(root,'')} → ${path}`);
 }}
console.log(`Checked internal links/assets across ${files.length} built pages.`);
if(missing.length){console.error('Broken references:\n'+missing.join('\n'));process.exit(1)}
console.log('No broken local links found.');
