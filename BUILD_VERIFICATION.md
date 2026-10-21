# Build verification status

The source, 32 JSON files, image paths, package/day relationships, and preview HTML were inspected with local scripts. The bundled page designs use the supplied CEYWAY TRANSIT branding and local sample images.

**Not verified here:** `npm install`, `astro check`, `astro build`, and end-to-end deployment, because the npm registry is not reachable in this environment. The local Chromium command also failed to start in this runtime, so no verified browser screenshot is claimed.

**Before deployment:** on a computer with Node.js 22 and internet access, run:

```bash
npm install
npm run validate
npm run check
npm run build
npm run preview
```

If you see errors, resolve them before deploying `dist/` to Cloudflare Pages. Replace demo data, check content accuracy and legal policies, configure your real domain, and use a private repository for the editable source.

The root `PREVIEW_OPEN_IN_BROWSER.html` is a self-contained **homepage visual mock-up** for convenient review. It is not the compiled multi-page Astro build and does not update when you edit JSON.
