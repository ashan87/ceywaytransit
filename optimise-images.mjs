/** Resize raster images; originals are left intact unless --write is specified. */
import sharp from 'sharp';
import { readdir,stat,mkdir } from 'node:fs/promises';
import { join,relative,dirname,extname,resolve } from 'node:path';
const root=resolve('public/images');const out=resolve('public/images-optimised');
const write=process.argv.includes('--write');
async function files(path){let all=[];for(const ent of await readdir(path,{withFileTypes:true})){const f=join(path,ent.name);if(ent.isDirectory())all=all.concat(await files(f));else if(/\.(jpg|jpeg|png|webp)$/i.test(ent.name))all.push(f);}return all;}
let total=0;let saved=0;
for(const f of await files(root)){
 const inputSize=(await stat(f)).size;
 const target=join(out,relative(root,f).replace(/\.(png|jpe?g|webp)$/i,'.webp'));
 await mkdir(dirname(target),{recursive:true});
 await sharp(f).rotate().resize({width:1400,withoutEnlargement:true}).webp({quality:80,effort:5}).toFile(target);
 const next=(await stat(target)).size;total+=inputSize;saved+=next;
 console.log(`${relative(root,f)}: ${(inputSize/1024).toFixed(0)} KB → ${(next/1024).toFixed(0)} KB`);
}
console.log(`Optimised copies created in ${relative(process.cwd(),out)}. ${(total/1024/1024).toFixed(2)} MB → ${(saved/1024/1024).toFixed(2)} MB.`);
if(write)console.log('Note: --write is intentionally non-destructive; review images-optimised/ and move the approved files into public/images manually.');
