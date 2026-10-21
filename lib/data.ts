import { packageSchema,destinationSchema,reviewsSchema,reviewSourcesSchema,faqSchema,authorSchema,stepsSchema,featuresSchema,taxonomySchema,wizardSchema,siteSchema,navigationSchema,homeSchema,statsSchema,currenciesSchema,paymentsSchema,translationSchema,blogSchema } from '../content/config';
import type { MarkdownInstance } from 'astro';
import type { BlogFrontmatter } from '../content/config';
import siteData from '../content/settings/site.json';
import navigationData from '../content/settings/navigation.json';
import homeData from '../content/settings/home.json';
import statsData from '../content/settings/stats.json';
import currenciesData from '../content/settings/currencies.json';
import paymentsData from '../content/settings/payment-methods.json';
import reviewData from '../content/reviews/reviews.json';
import reviewSourcesData from '../content/reviews/sources.json';
import stepsData from '../content/how-it-works/steps.json';
import featuresData from '../content/why-us/features.json';
import themesData from '../content/taxonomy/themes.json';
import dietaryData from '../content/taxonomy/dietary.json';
import authorsData from '../content/authors/authors.json';
import wizardData from '../content/forms/plan-trip.json';
import enData from '../content/i18n/en.json';

export const site = siteSchema.parse(siteData);
export const navigation = navigationSchema.parse(navigationData);
export const home = homeSchema.parse(homeData);
export const stats = statsSchema.parse(statsData);
export const currencies = currenciesSchema.parse(currenciesData);
export const paymentMethods = paymentsSchema.parse(paymentsData);
export const reviews = reviewsSchema.parse(reviewData);
export const reviewSources = reviewSourcesSchema.parse(reviewSourcesData);
export const steps = stepsSchema.parse(stepsData).steps;
export const features = featuresSchema.parse(featuresData).features;
export const themes = taxonomySchema.parse(themesData).items;
export const dietary = taxonomySchema.parse(dietaryData).items;
export const authors = authorSchema.parse(authorsData).authors;
export const wizard = wizardSchema.parse(wizardData);
export const en = translationSchema.parse(enData);
// Discover new JSON entries automatically when editors add them through Pages CMS.
// Astro/Vite replaces these globs during compilation.
const packageFiles = import.meta.glob('../content/packages/*.json', { eager: true, import: 'default' });
const destinationFiles = import.meta.glob('../content/destinations/*.json', { eager: true, import: 'default' });
const faqFiles = import.meta.glob('../content/faqs/*.json', { eager: true, import: 'default' });
export const packages = Object.values(packageFiles).map(v => packageSchema.parse(v));
export const destinations = Object.values(destinationFiles).map(v => destinationSchema.parse(v));
export const faqs = Object.values(faqFiles).map(v => faqSchema.parse(v));

// Markdown .md entries include their compiled Astro component and frontmatter.
export function getPosts() {
  const modules = import.meta.glob<MarkdownInstance<BlogFrontmatter>>('../content/blog/*.md', {eager:true});
  return Object.values(modules).map(post=>({ ...post,frontmatter:blogSchema.parse(post.frontmatter) }))
    .sort((a,b)=>b.frontmatter.publishedAt.localeCompare(a.frontmatter.publishedAt));
}
export function getTheme(id:string){return themes.find(t=>t.id===id)?.label ?? 'Island escape';}
export function relatedDestinations(ids:string[]){return destinations.filter(d=>ids.includes(d.id));}
export function waLink(text:string){return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;}
