import { defineConfig } from 'astro/config';
export default defineConfig({
  output: 'static',
  site: 'https://example.com', // REPLACE with your actual Cloudflare Pages custom domain
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { build: { cssCodeSplit: true } }
});
