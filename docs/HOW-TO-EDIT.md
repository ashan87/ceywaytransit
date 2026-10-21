# CEYWAY TRANSIT — How to Edit This Website

This is a **static Astro** website. Edit the files under `src/content/`; the public site has **no administrator login** and deliberately **no publicly accessible editing panel**.

## Start it on your computer

1. Install Node.js 20.3 or newer (Node 22 LTS recommended).
2. Extract the project ZIP and open a terminal inside `ceyway-transit/`.
3. Run `npm install` to download Astro and other packages. Internet access is required **once** for dependency installation.
4. Run `npm run dev` and open the localhost address printed in the terminal.
5. Run `npm run validate` before release, followed by `npm run build`.
6. The finished Cloudflare-ready static files will be inside `dist/`.

> The source project is the editable website. **Do not upload source JSON, local editor tooling, secrets, or node_modules to the public website.** Upload only the built `dist/` directory.

## Quick edit lookup

| What to edit | Where |
|---|---|
| Company name, phone, WhatsApp, email, site URL | `src/content/settings/site.json` |
| Header, footer, mobile navigation | `src/content/settings/navigation.json` |
| Homepage heading, feature IDs, section order, slideshow images | `src/content/settings/home.json` |
| A tour package | `src/content/packages/<slug>.json` |
| A destination | `src/content/destinations/<slug>.json` |
| Guest testimonials (only real and permitted reviews!) | `src/content/reviews/reviews.json` |
| Google / Tripadvisor platform links, counts, scores | `src/content/reviews/sources.json` |
| Planning, transport and payments FAQs | `src/content/faqs/*.json` |
| Travel-journal article and frontmatter | `src/content/blog/*.md` |
| Author details | `src/content/authors/authors.json` |
| Tour process / Why choose us | `src/content/how-it-works/steps.json` / `src/content/why-us/features.json` |
| Styles and dietary tags | `src/content/taxonomy/*.json` |
| Plan-trip wizard prompts and answer choices | `src/content/forms/plan-trip.json` |
| About, events, visa, terms, privacy | `src/content/pages/*.md` |
| Buttons, labels and navigation translations | `src/content/i18n/en.json` |
| Brand colours | `src/styles/tokens.css` |
| Layout, spacing and all responsive styling | `src/styles/global.css` |

## Add a package

1. Copy an existing package JSON file. Rename it e.g. `new-beach-holiday.json`.
2. Change `id` and `slug` to `new-beach-holiday`. They must match the filename.
3. Set a valid `theme` from `taxonomy/themes.json` and valid destination IDs.
4. Keep `itinerary.length` equal to `days`, and `nights` smaller than `days`.
5. Use an existing `/images/...` asset or place a new image in `public/images/packages/new-beach-holiday/`.
6. **Register the new file** by importing it in `src/lib/data.ts` and adding the import to the `packages` array. Repeat for new destination or FAQ JSON files in that same file.
7. To feature it on the homepage, add its id to `settings/home.json` under `featuredPackages`.
8. Run `npm run validate && npm run build`. Dynamic detail pages are generated automatically.

## Editing a destination

Follow the package steps using `destinations/<slug>.json`. Put at least 2 highlights, valid theme IDs and a local image path. New files also need a corresponding import added to `src/lib/data.ts`.

## Add a blog article

Copy one of the Markdown files in `src/content/blog/`, change the YAML heading at the top and write the body in Markdown. The `authorId` must appear in `authors/authors.json`; `theme` must match your taxonomy. Blog files are discovered automatically (no registry edit needed).

## Add or change images

Place photos or illustration files in `public/images/...`. Put the public URL (`/images/...`) into JSON. The included SVG coastal scenes and composite samples are *demonstration graphics*. Replace them with photos you own or are licensed to publish. Keep descriptive image alt text. Use `npm run optimise-images` to create **non-destructive WebP copies**; review the `public/images-optimised` output before replacing files.

## Guest feedback, payments, prices and trust numbers

- The included reviews are clearly marked *demo*, **not real customer reviews**. Delete or replace after obtaining consent.
- Sample package prices are `null`; the site says **Custom quote**. No online payment gateway is configured.
- Trust statistics are hidden until `verified:true`, a real `value`, and an ISO `asOf` date are present.
- Currency exchange rates are only sample config fields; no automatic conversions are shown.
- The displayed business address is a placeholder and must be updated.

## Contact forms and WhatsApp

The planning wizard and contact page prepare a WhatsApp or email message on the visitor's device. **They do not store submissions or send directly through the website**. Visitors must press *Send* in the external app. To receive website-stored leads, add a secured Cloudflare Worker (server-side validation, spam controls, storage consent and notices) later.

## Cloudflare Pages deployment

- Push the project to a private Git repository, connect it to Cloudflare Pages and select Astro (or enter build command `npm run build` and output directory `dist`). Recommended Node.js runtime: Node 22.
- Set the real domain in BOTH `astro.config.mjs` (`site`) and `src/content/settings/site.json` (`siteUrl`).
- Cloudflare Pages serves `public/_headers` after build. Headers are strict and there are no remote images, webfonts, analytics scripts or public editors.
- Check HTTPS, MFA on your Cloudflare account, custom-domain settings and DNS. Never put credentials in any of these files.
- `robots.txt` **blocks indexing while this is a demo**. Change `src/content/settings/site.json` to `demoMode:false` once every placeholder has been reviewed; update `public/robots.txt` to allow indexing; add a sitemap as needed.
- `terms.md` and `privacy.md` are **draft placeholders**, not legal policies ready for publication.

## Security reminder

A password field inside browser HTML is **not** secure authentication. Keep this project source private and deploy only built static assets. Use Cloudflare Zero Trust Access or a properly authenticated server app if you later build a real online content-management interface.
