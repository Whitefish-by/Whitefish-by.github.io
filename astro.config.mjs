import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://paperenjoyer.com',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
