/** Run with npm run validate. Independent of Astro/Vite so CMS-created files are discovered. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  packageSchema, destinationSchema, faqSchema, blogSchema, pageFrontmatterSchema,
  reviewsSchema, reviewSourcesSchema, siteSchema, homeSchema, navigationSchema,
  statsSchema, currenciesSchema, paymentsSchema, translationSchema,
  stepsSchema, featuresSchema, taxonomySchema, authorSchema, wizardSchema,
} from '../src/content/config.ts';
const root = resolve(process.cwd());
const content = join(root, 'src', 'content');
const errors: string[] = [];
function check(ok: boolean, message: string) { if (!ok) errors.push(message); }
function readJson<T>(path: string, schema: {parse:(v:unknown)=>T}): T {
  return schema.parse(JSON.parse(readFileSync(join(content,path), 'utf8')));
}
function collection<T>(dir: string, schema: {parse:(v:unknown)=>T}): T[] {
  return readdirSync(join(content,dir)).filter(n=>n.endsWith('.json')).sort().map(name => {
    try {
      const entry=readJson(`${dir}/${name}`,schema) as any;
      const fileId=name.slice(0,-5);
      check(entry.id===fileId,`${dir}/${name}: id must match filename`);
      if ('slug' in entry) check(entry.slug===fileId,`${dir}/${name}: slug must match filename`);
      return entry as T;
    } catch(e) { errors.push(`${dir}/${name}: ${String(e)}`);return null; }
  }).filter(v=>v!==null) as T[];
}
const site=readJson('settings/site.json',siteSchema);
const home=readJson('settings/home.json',homeSchema);
const navigation=readJson('settings/navigation.json',navigationSchema);
const stats=readJson('settings/stats.json',statsSchema);
const currencies=readJson('settings/currencies.json',currenciesSchema);
const payments=readJson('settings/payment-methods.json',paymentsSchema);
const translations=readJson('i18n/en.json',translationSchema);
const reviews=readJson('reviews/reviews.json',reviewsSchema);
const sources=readJson('reviews/sources.json',reviewSourcesSchema);
const authors=readJson('authors/authors.json',authorSchema);
const steps=readJson('how-it-works/steps.json',stepsSchema).steps;
const features=readJson('why-us/features.json',featuresSchema).features;
const wizard=readJson('forms/plan-trip.json',wizardSchema);
const themes=readJson('taxonomy/themes.json',taxonomySchema).items;
const dietary=readJson('taxonomy/dietary.json',taxonomySchema).items;
const packages=collection('packages',packageSchema);
const destinations=collection('destinations',destinationSchema);
const faqs=collection('faqs',faqSchema);
const ids=<T extends {id:string}>(items:T[])=>new Set(items.map(item=>item.id));
const packageIds=ids(packages), destinationIds=ids(destinations), themeIds=ids(themes), authorIds=ids(authors.authors), sourceIds=ids(sources.sources);
for(const item of packages) {
  check(themeIds.has(item.theme),`Tour ${item.id}: unknown theme ${item.theme}`);
  item.destinations.forEach(dest=>check(destinationIds.has(dest),`Tour ${item.id}: unknown destination ${dest}`));
}
for(const dest of destinations) dest.themes.forEach(theme=>check(themeIds.has(theme),`Destination ${dest.id}: unknown theme ${theme}`));
home.featuredPackages.forEach(id=>check(packageIds.has(id),`Homepage: unknown featured package ${id}`));
home.featuredDestinations.forEach(id=>check(destinationIds.has(id),`Homepage: unknown featured destination ${id}`));
check(new Set(home.sectionOrder).size===home.sectionOrder.length,'Homepage: duplicate sectionOrder entries');
reviews.items.forEach(r=>check(sourceIds.has(r.sourceId),`Review ${r.id}: unknown source ${r.sourceId}`));
check(steps.length===4,'This demo design expects exactly 4 process steps');
check(features.length===4,'This demo design expects exactly 4 why-us features');
check(wizard.steps.length===4,'The trip planner expects exactly 4 steps');
check(dietary.length>0 && Object.keys(translations.buttons).length>0,'Missing taxonomy or interface text');
check(stats.items.every(s=>!s.verified||Boolean(s.asOf)),'Verified statistics must have an asOf date');
check(payments.showIcons||payments.methods.length===0,'Disabled payments must not list icons');
check(site.whatsapp===site.phone.replace(/\D/g,''),'Phone and WhatsApp numbers must match');
const imgs=new Set<string>();
function collectImages(v:unknown) {
  if(typeof v==='string'&&v.startsWith('/images/'))imgs.add(v);
  else if(Array.isArray(v)) v.forEach(collectImages);
  else if(v && typeof v==='object') Object.values(v).forEach(collectImages);
}
for(const val of [site,home,packages,destinations,reviews,authors,payments]) collectImages(val);
function simpleFrontmatter(raw:string) {
  const section=raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if(!section) throw new Error('Missing YAML frontmatter');
  const result:Record<string,unknown>={};
  for(const line of section[1].split(/\r?\n/)){
    const m=line.match(/^([a-zA-Z]\w*):\s*(.*)$/);
    if(!m) continue;
    let v=m[2].trim();
    if(v==='true'||v==='false')result[m[1]]=v==='true';
    else result[m[1]]=v.replace(/^['"]|['"]$/g,'');
  }
  return result;
}
for(const name of readdirSync(join(content,'blog')).filter(n=>n.endsWith('.md'))) {
  try{
    const meta=blogSchema.parse(simpleFrontmatter(readFileSync(join(content,'blog',name),'utf8')));
    check(meta.slug===name.slice(0,-3),`Blog ${name}: slug does not match filename`);
    check(themeIds.has(meta.theme),`Blog ${name}: unknown theme`);
    check(authorIds.has(meta.authorId),`Blog ${name}: unknown author`);
    imgs.add(meta.image);
  }catch(e){errors.push(`Blog ${name}: ${String(e)}`)}
}
for(const name of readdirSync(join(content,'pages')).filter(n=>n.endsWith('.md'))) {
  try{ pageFrontmatterSchema.parse(simpleFrontmatter(readFileSync(join(content,'pages',name),'utf8'))); }
  catch(e){errors.push(`Page ${name}: ${String(e)}`)}
}
imgs.forEach(img=>check(existsSync(join(root,'public',img.slice(1))),`Missing image file: ${img}`));
for(const link of [...navigation.header,...navigation.mobile,...navigation.footer.flatMap(v=>v.links)]) check(Boolean(link.href),`Navigation link ${link.label} missing href`);
console.log(`Checked ${packages.length} packages, ${destinations.length} destinations, ${faqs.length} FAQ categories, ${imgs.size} images.`);
if(errors.length){console.error('VALIDATION FAILED:\n'+errors.map(e=>'  - '+e).join('\n'));process.exit(1)}
console.log('All CEYWAY TRANSIT content checks passed.');
