# CEYWAY TRANSIT — Backend installation guide

**This package provides working backend source code, but it is NOT deployed or activated.** Your current Astro website can continue running normally. Complete all Cloudflare setup steps before replacing the live Wrangler configuration.

## What this version does

- Saves **Contact Us** enquiries and **Plan My Trip** requests in Cloudflare D1.
- Includes visitor consent checkboxes and Cloudflare Turnstile CAPTCHA verification (server-side).
- Adds a private `/admin/` dashboard to list enquiries and edit status and internal notes, or delete a request.
- Uses **Cloudflare Access**, with actual JWT verification and an administrator email allowlist, to protect customer data. This is not a public admin portal.
- Keeps WhatsApp fallback. Existing packages, destinations, blog content, photo slideshow, and Pages CMS remain in the static Astro website.
- No automatic email alerts, payment gateway, live booking confirmation, customer login, media-upload service or availability calendar are included in this first version.

## Before uploading anything: back up your working website

Your existing project is connected to GitHub `ashan87/ceywaytransit`, `main`, and the Cloudflare Worker `ceywaytransit1`.

Because you've previously had missing-file problems during GitHub browser uploads, **do not replace the full live site**. Keep a backup / restore point and upload only the changed files from the patch, at exactly the paths listed below. Do not upload an extra nested folder.

### Changed paths in the backend patch

```
worker.ts
wrangler.backend.EXAMPLE.jsonc
migrations/0001_enquiries.sql
src/lib/enquiry-client.ts
src/pages/contact.astro
src/pages/admin/index.astro
src/components/PlanWizard.astro
src/styles/global.css
src/content/forms/plan-trip.json
src/content/pages/privacy.md
public/_headers
docs/CEYWAY_BACKEND_SETUP.md
```

**Important:** Compare existing `src/styles/global.css` and `public/_headers` if you changed them after the previous project ZIP. `src/content/forms/plan-trip.json` and `src/content/pages/privacy.md` may contain changes you made in Pages CMS; do not overwrite those edits without reviewing differences. The privacy document provided here is clearly marked DRAFT; it needs legal/business review.

## Step 1 — Create the database in Cloudflare

Option A (dashboard; easiest):

1. Sign in at https://dash.cloudflare.com/ .
2. Open **Storage & databases → D1** (menu labels may vary).
3. Create a database named exactly `ceywaytransit-enquiries`.
4. Note its **Database ID** (UUID); do not share account credentials.
5. Open its **Console** tab, paste the SQL from `migrations/0001_enquiries.sql`, and run the SQL. Confirm the `enquiries` table exists.

Option B (Wrangler terminal, if you prefer):

```
npx wrangler login
npx wrangler d1 create ceywaytransit-enquiries
# Add the returned database_id to wrangler.jsonc, then:
npx wrangler d1 migrations apply ceywaytransit-enquiries --remote
```

Use **only one** initial schema-creation method. Do not expose the database ID as a secret; it is a resource identifier, not an authentication credential.

## Step 2 — Create the Turnstile security widget

1. Open **Cloudflare Dashboard → Turnstile**.
2. Add a widget for your website hostname `ceywaytransit1.ashansperera.workers.dev` (and your custom domain if you later connect one).
3. Copy the **Site Key** and **Secret Key** separately.
4. In your Cloudflare Worker `ceywaytransit1`, go to **Settings → Variables and Secrets**. Create:
   - `TURNSTILE_SITE_KEY` = your public site key (plain text)
   - `TURNSTILE_SECRET_KEY` = secret key (**Secret** type)
5. **Never** put the secret key in a GitHub file or Pages CMS.

Without these two settings, the forms will show a WhatsApp fallback rather than silently accepting unprotected submissions.

## Step 3 — Protect the private administration area with Cloudflare Access

1. Enable **Cloudflare Zero Trust** if it isn't already enabled.
2. Open **Zero Trust → Access → Applications → Add an application → Self-hosted**.
3. Protect the following URL paths, ideally under **one** Access application so they share an application audience (AUD):
   - `ceywaytransit1.ashansperera.workers.dev/admin/*`
   - `ceywaytransit1.ashansperera.workers.dev/api/admin/*`
   - Also cover `/admin` if the application path editor handles it separately.
4. Create an **Allow** policy limited to your personal administrator email account(s); do not permit Everyone. Use a supported sign-in method (for example, email one-time PIN).
5. From the new Access application's details, copy the **Application AUD Tag**.
6. Find your Cloudflare Access team domain, such as `your-team.cloudflareaccess.com`. Do **not** include `https://` in the saved value.
7. In **Workers & Pages → ceywaytransit1 → Settings → Variables and Secrets** create:
   - `CF_ACCESS_TEAM_DOMAIN` = your-team.cloudflareaccess.com
   - `CF_ACCESS_AUD` = your Access Application AUD Tag (if multiple Access apps, separate multiple AUD tags with commas)
   - `ADMIN_EMAILS` = the email address(es) permitted to use the dashboard, comma-separated

The Worker verifies the Access JWT cryptographically and checks that the email is explicitly permitted. Simply visiting the admin URL is not enough to read enquiries.

**Important:** Do not use Cloudflare's *Protect this Worker* option for the entire Worker; that would put the whole public travel website behind a login. Protect only the admin paths using a path-based **self-hosted Access application**.

## Step 4 — Complete the Wrangler configuration

1. Open `wrangler.backend.EXAMPLE.jsonc` included in this package.
2. Replace only `REPLACE_WITH_YOUR_REAL_D1_DATABASE_ID` with your newly created D1 database UUID.
3. Save it as **`wrangler.jsonc` in the repository ROOT**, replacing the previous static-only Wrangler file.
4. Keep the Worker name `ceywaytransit1` and `assets.directory` as `./dist`. **Do not use a different project name.**
5. Keep the existing Cloudflare build command `npm run build` and deploy command `npx wrangler deploy`.

The `wrangler.backend.EXAMPLE.jsonc` file is intentionally **not** named `wrangler.jsonc` so accidentally uploading the patch does not break the currently working website with an invalid database identifier.

## Step 5 — Upload the patch to GitHub

Upload the extracted **contents** of `CEYWAY_TRANSIT_BACKEND_PATCH.zip`, preserving paths. Verify in GitHub after commit:

- `worker.ts`
- `src/pages/admin/index.astro`
- `src/pages/contact.astro`
- `src/lib/enquiry-client.ts`
- `migrations/0001_enquiries.sql`
- `wrangler.jsonc` (after you created it with the real database ID)

When committed to the `main` branch, your existing Cloudflare GitHub integration should build and deploy automatically. Monitor its build log. If any step fails, do not delete your working earlier deployment; use the Cloudflare deployment history to roll back.

## Step 6 — Check the site after a successful deployment

1. Open `https://ceywaytransit1.ashansperera.workers.dev/api/health` — it should respond with `ok: true`, `databaseConfigured: true`, and `formsEnabled: true`.
2. Open **Contact Us** and make one test enquiry with valid Turnstile verification. You should get a confirmation that the request was received.
3. Visit `https://ceywaytransit1.ashansperera.workers.dev/admin/`. It should redirect you through Cloudflare Access or deny access if you are not signed in as an approved administrator.
4. After login, check whether the test enquiry appears in the dashboard, change its status, and save.
5. Test **Plan My Trip** using its final Contact Details step.
6. View the website on mobile and verify WhatsApp fallback still works.

## Privacy and security before serving real customers

- This is a functional starter backend, not a complete legal/compliance package. **Finish your Privacy Policy** (the provided file is a draft), data-retention schedule, and access procedures before collecting production customer data. Consider the legal obligations applicable to your business and international visitors.
- Configure Cloudflare **WAF / rate limiting** for `POST /api/enquiries`, review logging, and restrict who can administer the Worker, D1 database and GitHub repository.
- Enable 2FA on GitHub and Cloudflare.
- Avoid collecting passport scans, bank details or card numbers with these enquiry forms.
- Manage access carefully and review dashboard records regularly; this version does not send automatic email notifications.
- The dashboard supports manual deletion; **automatic retention/deletion is not implemented**.
- Test a full production deployment and confirm Cloudflare Access protects both dashboard and API routes before relying on it with real data.

## Underlying documentation

- Cloudflare Workers static assets + API: https://developers.cloudflare.com/workers/static-assets/binding/
- Cloudflare D1 database: https://developers.cloudflare.com/d1/get-started/
- Cloudflare D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/get-started/
- Cloudflare Access for Workers: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
