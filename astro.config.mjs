import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://paperenjoyer.com',
  output: 'static',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
});
