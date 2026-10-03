import type { APIRoute } from 'astro';

/**
 * Ommaviy sahifalar ochiq; shaxsiy kabinet, kirish, admin, API va
 * tahlil natijasi sahifalari indekslanmaydi (H1).
 */
export const GET: APIRoute = ({ site }) =>
  new Response(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /kabinet',
      'Disallow: /kirish',
      'Disallow: /natija',
      'Disallow: /tekshirish',
      'Disallow: /api/',
      'Disallow: /.netlify/',
      '',
      `Sitemap: ${new URL('sitemap.xml', site ?? 'https://dimed.uz').href}`,
      '',
    ].join('\n'),
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
