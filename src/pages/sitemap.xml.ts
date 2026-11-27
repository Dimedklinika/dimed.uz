import type { APIRoute } from 'astro';
import { LANGS, type Lang } from '../data/i18n';
import { langHref, HTML_LANG } from '../data/home';

/**
 * Ochiq sahifalar. Kabinet, kirish, admin va natija sahifalari bu
 * yerga kirmaydi (robots.txt ularni yopadi). Ro'yxat qo'lda: sayt
 * statik yig'iladi va ochiq sahifalar bir qo'l barmog'ida sanaladi.
 *
 * `langs` — sahifa qaysi tillarda alohida manzilga ega. Bosh sahifa va
 * tahlillar uchtasida (`/`, `/ru/`, `/en/`), maxfiylik esa bitta
 * manzilda turadi va tilni brauzerda almashtiradi.
 */
const pages: { path: string; priority: string; changefreq: string; langs: readonly Lang[] }[] = [
  { path: '/', priority: '1.0', changefreq: 'weekly', langs: LANGS },
  { path: '/tahlillar', priority: '0.8', changefreq: 'weekly', langs: LANGS },
  { path: '/tashrif-shifokorlar', priority: '0.8', changefreq: 'weekly', langs: LANGS },
  { path: '/maxfiylik', priority: '0.3', changefreq: 'yearly', langs: ['uz'] },
];

// Build vaqti — sayt har deploy'da qayta yig'iladi.
const lastmod = new Date().toISOString().slice(0, 10);

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://dimed.uz');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages
  .flatMap((p) =>
    p.langs.map(
      (lang) => `  <url>
    <loc>${new URL(langHref(p.path, lang), base).href}</loc>
${p.langs
  .map(
    (other) =>
      `    <xhtml:link rel="alternate" hreflang="${HTML_LANG[other]}" href="${new URL(langHref(p.path, other), base).href}" />`,
  )
  .join('\n')}
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
    ),
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
