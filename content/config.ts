/** All editable JSON/Markdown content is validated with these Zod schemas. */
import { z } from 'zod';

const slug = z.string().min(2).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const localImage = z.string().startsWith('/images/');
const internalLink = z.string().refine(v => v.startsWith('/') || v.startsWith('https://'), 'Use an absolute site path or HTTPS URL');
const optionalUrl = z.string().url().nullable();
const itemBase = z.object({ id: slug, title: z.string().min(2) });
export const themeId = z.enum(['beach', 'nature', 'heritage', 'honeymoon', 'family', 'adventure']);

export const packageSchema = itemBase.extend({
  slug, days: z.number().int().min(1).max(90), nights: z.number().int().min(0),
  theme: themeId, difficulty: z.string(), image: localImage, summary: z.string().min(20),
  destinations: z.array(slug).min(1), tags: z.array(z.string()),
  highlights: z.array(z.string()).min(1), priceFrom: z.number().nonnegative().nullable(),
  currency: z.enum(['USD','LKR','EUR','GBP']), inclusions: z.array(z.string()), exclusions: z.array(z.string()),
  itinerary: z.array(z.object({ day: z.number().int().positive(), title: z.string().min(3), description: z.string().min(10) })),
  featured: z.boolean(), sample: z.boolean()
}).superRefine((p,ctx) => {
  if (p.nights >= p.days) ctx.addIssue({code:z.ZodIssueCode.custom,message:'Nights must be fewer than days',path:['nights']});
  if (p.itinerary.length !== p.days) ctx.addIssue({code:z.ZodIssueCode.custom,message:'One itinerary day required per day',path:['itinerary']});
  if (p.id !== p.slug) ctx.addIssue({code:z.ZodIssueCode.custom,message:'ID must equal slug',path:['slug']});
});
export const destinationSchema = itemBase.extend({
  slug, region:z.string(), shortDescription:z.string().min(10), description:z.string().min(30),
  image:localImage, imageAlt:z.string(), themes:z.array(themeId).min(1), highlights:z.array(z.string()).min(2),
  bestTime:z.string(), featured:z.boolean(), sample:z.boolean()
});
export const reviewSchema = z.object({id:slug,name:z.string(),country:z.string(),rating:z.number().int().min(1).max(5),quote:z.string(),date:z.string().nullable(),sourceId:slug,verified:z.boolean(),photo:localImage.nullable()});
export const reviewsSchema = z.object({disclaimer:z.string(),items:z.array(reviewSchema)});
export const reviewSourcesSchema = z.object({sources:z.array(z.object({id:slug,name:z.string(),profileUrl:optionalUrl,rating:z.number().min(0).max(5).nullable(),reviewCount:z.number().int().nonnegative().nullable(),asOf:z.string().nullable()}))});
export const faqSchema = z.object({id:slug,title:z.string(),items:z.array(z.object({question:z.string().min(5),answer:z.string().min(10)})).min(1)});
export const authorSchema = z.object({authors:z.array(z.object({id:slug,name:z.string(),photo:localImage.nullable(),bio:z.string(),sample:z.boolean()}))});
export const stepsSchema = z.object({steps:z.array(z.object({number:z.number().int().positive(),title:z.string(),description:z.string(),icon:z.string()}))});
export const featuresSchema = z.object({features:z.array(z.object({id:slug,icon:z.string(),title:z.string(),description:z.string()}))});
export const taxonomySchema = z.object({items:z.array(z.object({id:slug,label:z.string(),emoji:z.string().optional()}))});
export const wizardSchema = z.object({title:z.string(),intro:z.string(),steps:z.array(z.object({id:slug,title:z.string(),description:z.string(),type:z.enum(['multi','date','number','textarea']),options:z.array(z.object({label:z.string(),value:z.string(),emoji:z.string().optional()}))})).min(1),submitLabel:z.string(),successNote:z.string()});
export const siteSchema = z.object({
  name:z.string().min(3),tagline:z.string(),subtagline:z.string(),phone:z.string().regex(/^\+[1-9]\d{8,14}$/),
  phoneDisplay:z.string(),whatsapp:z.string().regex(/^[1-9]\d{8,14}$/),email:z.string().email(),
  address:z.string(),serviceArea:z.string(),siteUrl:z.string().url(),
  socials:z.object({instagram:optionalUrl,facebook:optionalUrl}),logo:localImage,footerNote:z.string(),demoMode:z.boolean()
});
const navLink = z.object({label:z.string(),href:internalLink,icon:z.string().optional()});
export const navigationSchema = z.object({header:z.array(navLink),footer:z.array(z.object({title:z.string(),links:z.array(navLink)})),mobile:z.array(navLink)});
export const homeSchema = z.object({eyebrow:z.string(),heroTitle:z.string(),heroHighlight:z.string(),heroDescription:z.string(),heroImage:localImage,heroSlides:z.array(localImage).min(1),featuredPackages:z.array(slug),featuredDestinations:z.array(slug),sectionOrder:z.array(z.enum(['features','destinations','packages','steps','reviews','journal','cta'])),seasonNote:z.string()});
export const statsSchema = z.object({items:z.array(z.object({id:slug,label:z.string(),value:z.number().nonnegative().nullable(),suffix:z.string(),asOf:z.string().nullable(),verified:z.boolean()})).superRefine((items,ctx)=>items.forEach((s,i)=>{if(s.verified && (s.value===null || !s.asOf))ctx.addIssue({code:z.ZodIssueCode.custom,path:[i],message:'Verified stats require a value and asOf date'});})),note:z.string()});
export const currenciesSchema = z.object({base:z.enum(['USD','LKR','EUR','GBP']),display:z.array(z.enum(['USD','LKR','EUR','GBP'])),rates:z.record(z.number().positive().nullable()),ratesAsOf:z.string().nullable(),notice:z.string()});
export const paymentsSchema = z.object({showIcons:z.boolean(),methods:z.array(z.object({name:z.string(),icon:localImage})),note:z.string()});
export const translationSchema = z.object({nav:z.record(z.string()),buttons:z.record(z.string()),labels:z.record(z.string()),notices:z.record(z.string())});
export const blogSchema = z.object({title:z.string().min(4),slug,publishedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),authorId:slug,theme:themeId,image:localImage,description:z.string().min(20),sample:z.boolean()});
export const pageFrontmatterSchema = z.object({title:z.string(),description:z.string()});
export type Package = z.infer<typeof packageSchema>;
export type Destination = z.infer<typeof destinationSchema>;
export type BlogFrontmatter = z.infer<typeof blogSchema>;
