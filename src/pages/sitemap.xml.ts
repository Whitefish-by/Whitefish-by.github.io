import type { APIRoute } from 'astro';
import { localeKeys, localizedPath, type TranslatedPage } from '../data/locales';
export const GET: APIRoute = ({ site }) => {
  const url = (path: string) => new URL(path, site).href;
  const entries = (['home', 'pricing'] as TranslatedPage[]).flatMap((page) => {
    const alternates =
      localeKeys
        .map(
          (locale) =>
            `<xhtml:link rel="alternate" hreflang="${locale}" href="${url(localizedPath(locale, page))}"/>`,
        )
        .join('') +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${url(localizedPath('en', page))}"/>`;
    return localeKeys.map(
      (locale) => `<url><loc>${url(localizedPath(locale, page))}</loc>${alternates}</url>`,
    );
  });
  for (const path of ['/terms', '/privacy', '/refund'])
    entries.push(`<url><loc>${url(path)}</loc></url>`);
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join('')}</urlset>`,
    {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    },
  );
};
