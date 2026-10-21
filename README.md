# CEYWAY TRANSIT — Astro + Free Editing Dashboard

A Sri Lanka tropical tourism website built with Astro. Tour packages, destinations, homepage copy, photos, FAQs, articles, and company details are in `src/content/` as JSON or Markdown.

## Edit without coding
This edition includes **Pages CMS configuration** (`.pages.yml`) for a free secure GitHub-authenticated editing dashboard at https://app.pagescms.org/. The dashboard becomes usable **after** you upload the source to your own GitHub repository and connect your GitHub account. It is not a local public admin login.

**Start here:** [Set up the free editing dashboard](docs/SET_UP_FREE_EDITING_DASHBOARD.md).

## Run it locally
Requires a recent Node.js release (Node 22 recommended):

```sh
npm install
npm run dev
```

## Check and build for Cloudflare Pages
```sh
npm run validate
npm run build
```
Output: `dist/`. In Cloudflare Pages choose a Git-connected project, build command `npm run build`, output `dist`.

## Editing and project structure
- `.pages.yml` — free CMS form definitions and media storage; reads exactly from the folders below
- `src/content/settings/home.json` — homepage headings, slideshow and featured IDs
- `src/content/settings/site.json` — phone, email, WhatsApp and company name
- `src/content/packages/*.json` — tour content; newly created packages automatically receive detail routes
- `src/content/destinations/*.json` — destination content; newly created destinations automatically receive detail routes
- `src/content/faqs/*.json` — FAQs; newly created FAQ categories automatically appear
- `src/content/blog/*.md` — blog with Markdown editor
- `src/content/pages/*.md` — about, events, visa, privacy and terms pages
- `public/images/` — website images
- `docs/HOW-TO-EDIT.md` — manual editing reference

## Before launch
All packages, reviews, statistics and prices were supplied as **demo data**; validate/replace before publishing. Update the `https://example.com` site URL. Site enquiry links use WhatsApp; the site has no booking backend or payment processing.

## Verification limitations
The CMS YAML structure, local paths, and content files can be inspected offline. **This ZIP has not been logged into the Pages CMS service and a production Astro/npm build has not been completed here** due to npm registry access restrictions. Test first in your own GitHub and Cloudflare account before announcing it as live.
