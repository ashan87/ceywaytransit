# CEYWAY TRANSIT — Set up the free editing dashboard

## What this is
This Astro website works with **Pages CMS**, a hosted free, open-source, GitHub-based editor: https://app.pagescms.org/ . The editor is a separate website, not a public `/admin` endpoint on your CEYWAY website. It reads the `.pages.yml` file at the root of your GitHub project and presents editing forms for the existing JSON and Markdown content.

**No CMS account or live deployment has been created by this ZIP.** You must connect GitHub and Cloudflare using your own accounts, and you control the permissions.

## Before you start
- Create or sign in to a GitHub account: https://github.com . Turn on two-factor authentication (2FA).
- Have access to your Cloudflare account: https://dash.cloudflare.com/ . Turn on 2FA.
- Extract `CEYWAY_TRANSIT_FREE_CMS_SOURCE.zip` and locate the `ceyway-transit` folder.
- Keep `src/content/settings/site.json` up to date. The starter email and phone are ceywaytransit@gmail.com and +94 71 332 929.

## Step 1: Create a GitHub repository
1. Create a new **private** GitHub repository, e.g. `ceyway-transit`. Private is recommended for limiting source-code access. The published website itself will still be visible to visitors.
2. Upload the **contents** of the extracted `ceyway-transit` folder into the repository root (not an extra nested folder). Be sure that the root contains `package.json`, `astro.config.mjs`, `.pages.yml`, `src/`, and `public/`. GitHub's browser uploader may not show hidden files; confirm `.pages.yml` was included. Use GitHub Desktop or Git if preferred.
3. Do not upload `.env` files, credentials, API tokens, private customer data, or the ZIP itself. The included `.gitignore` excludes `.env*`.

## Step 2: Connect Pages CMS
1. Open https://app.pagescms.org/ and sign in using **GitHub**.
2. Install/authorize the Pages CMS GitHub App. Grant access only to your new **ceyway-transit** repository rather than all repositories.
3. Choose the correct repository and `main` branch in Pages CMS.
4. Pages CMS will read the included `.pages.yml` configuration and show grouped editing sections:
   - Homepage and business details (home slideshow, phone, email, menus)
   - Tours and destinations (new tours and destinations, images, highlights, itineraries)
   - Customer content (reviews, FAQs, how it works, trip planner)
   - Travel journal and long pages (rich-text editor)
   - Advanced settings (some complex JSON files require careful editing)
5. Open **Homepage text and slideshow**, make a small change, and save. The change should appear as a GitHub commit.

### Important content rules
- Package and destination **ID, slug, and filename must match**, e.g. `lagoon-sunshine` in all three places. When you create an entry, choose the slug once and keep it unchanged. Altering existing slugs can break links.
- A package must have **one itinerary item per day** and fewer nights than days, or the content validator will reject the build.
- Set each destination ID listed in a package to the exact ID of an existing destination.
- Select real images using the uploader. Upload new JPG, PNG, or WebP only; avoid untrusted SVG uploads.
- Sample prices, reviews, stats, and tour inclusions are placeholders. Replace them only with genuine verified information, and keep `sample: true` until verified.
- Some advanced nullable/optional settings use a raw JSON editor. Do not change those unless you understand the schema.

## Step 3: Publish to Cloudflare Pages (Git-connected)
1. In Cloudflare go to **Workers & Pages → Create → Pages → Connect to Git** (menu wording may change).
2. Authorize Cloudflare to access **only the CEYWAY repository**, then select the repository and branch `main`.
3. Configure the build:
   - Framework: **Astro** (or None with the following explicit settings)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/` (if repository root contains `package.json`)
   - Node.js: version 22 (set `NODE_VERSION=22` if needed)
4. Deploy. Your first deployment will have a `*.pages.dev` URL.
5. Open the Pages project **Custom domains** section to connect your purchased business domain. Follow Cloudflare's actual DNS instructions and verify HTTPS.
6. From then on, editing content in Pages CMS saves changes to GitHub; a successful Git-connected Cloudflare Pages build deploys those updates automatically.

**Important existing-project limitation:** If your original Cloudflare Pages website was created using **Direct Upload** (ZIP upload), you cannot convert that project into a Git-integrated project. Create a **new Pages project** connected to GitHub, then move your custom domain when ready. This is a documented Cloudflare limitation.

## Step 4: Check every deployment
Before sharing the URL with customers, check:
- Home hero slideshow, tour cards, detail pages, destination pages, mobile navigation, WhatsApp, and email links.
- Replace any `https://example.com` site URL in the CMS settings with your actual domain (URL should include `https://`).
- Remove demo reviews and sample claims or leave them visibly labelled as demonstrations.
- Confirm that privacy and terms text reflects your actual business and applicable rules; the supplied text is draft content, not legal advice.
- Check GitHub commit history and Cloudflare deployment status after each change.

## Security checklist
- Enable **2FA** on both GitHub and Cloudflare accounts and keep recovery codes private.
- Use a **private GitHub repo** and grant Pages CMS + Cloudflare access only to that repo.
- Do not put a password, GitHub token, private customer enquiries, or other secrets in `src/content/`, the source repository, or any public page.
- No public website editor/admin route is shipped. Only users with permitted GitHub access should be able to edit content through Pages CMS.
- The public Astro website is static. The trip-planning form opens WhatsApp; it does not store customer messages or take card payments.
- Security headers in `public/_headers` apply **when served by Cloudflare Pages**, not just by opening the HTML file locally.
- Never promise that all future CMS saves will publish successfully: content validation can fail, in which case Cloudflare keeps the previous successful deployment.

## Troubleshooting
**Editor shows no content:** Check that `.pages.yml` is in your repository root, and that Pages CMS is pointing at the right branch and repository.

**New tour is not showing:** Confirm the file is under `src/content/packages/`, the filename matches the `id` and `slug`, the JSON is valid, all destination IDs exist, and the GitHub commit triggered a Cloudflare build. The Astro project auto-discovers package and destination JSON files at build time.

**Broken image:** Image paths should start with `/images/` and the matching file should exist under `public/images/`. Use the media manager to upload.

**Build fails:** Review the Cloudflare build logs. Locally run `npm install`, `npm run validate`, and `npm run build` if you have Node.js installed. The validator checks referenced IDs, image paths, required itinerary entries, and other content rules.

**I want the editor at ceywaytransit.com/admin:** This project intentionally avoids an unprotected local admin route. A separate custom authenticated admin on your domain would be a later, additional project.

## Reference docs
- Pages CMS: https://pagescms.org/docs/quick-start/
- Pages CMS settings: https://pagescms.org/docs/configuration/
- Cloudflare Pages Git integration: https://developers.cloudflare.com/pages/configuration/git-integration/
