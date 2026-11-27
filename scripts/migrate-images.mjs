/**
 * Hozirgi rasmlarni yangi tizimga ko'chirish (bir martalik).
 *
 * Repodagi rasmlar (`public/images/...`) — banner, galereya va
 * shifokorlar rasmlari — Netlify Blobs'ga yuklanadi (siqilib, WebP),
 * DynamoDB `site_media` jadvaliga esa havola yoziladi. Shundan keyin
 * har bir rasmni /admin → «Rasmlar» bo'limidan almashtirish mumkin.
 *
 * Idempotent: `site_media` da yozuvi bor slot o'tkazib yuboriladi
 * (admin allaqachon almashtirgan rasm bosib ketilmaydi). `--force` —
 * baribir qayta yuklash. `--dry` — hech narsa yozmasdan rejani ko'rsatish.
 *
 * `doctors` jadvali faqat o'qiladi (shifokor rasmlarining ro'yxati uchun).
 *
 * Kerakli muhit o'zgaruvchilari (PowerShell: $env:NOM="..."):
 *   DIMED_AWS_ACCESS_KEY_ID, DIMED_AWS_SECRET_ACCESS_KEY, DIMED_AWS_REGION
 *   NETLIFY_SITE_ID     — Netlify: Site configuration → Site details → Site ID
 *   NETLIFY_AUTH_TOKEN  — Netlify: User settings → Applications → Personal access token
 *
 * Ishlatish:
 *   npm run migrate-images -- --dry
 *   npm run migrate-images
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const lib = (name) => import(pathToFileURL(join(root, 'netlify', 'functions', 'lib', name)).href);

/**
 * @param {{ dry?: boolean, force?: boolean, log?: (line: string) => void }} options
 * @returns {Promise<{ migrated: number, skipped: number, missing: number }>}
 */
export async function migrateImages({ dry = false, force = false, log = console.log } = {}) {
  const { saveImage, removeImage } = await lib('media.ts');
  const { STATIC_SLOTS, doctorSlots, getSlot, putSlot } = await lib('media-slots.ts');

  const doctors = await doctorSlots();
  const plan = [...STATIC_SLOTS, ...doctors]
    .filter((s) => s.fallback.startsWith('/images/'))
    .map((s) => ({ slot: s.id, label: s.label, purpose: s.purpose, file: join(root, 'public', s.fallback) }));

  let migrated = 0;
  let skipped = 0;
  let missing = 0;

  for (const item of plan) {
    const existing = await getSlot(item.slot);
    if (existing && !force) {
      log(`=  ${item.slot} — allaqachon ko'chirilgan (${existing.url}), o'tkazib yuborildi`);
      skipped++;
      continue;
    }

    const bytes = await readFile(item.file).catch(() => null);
    if (!bytes) {
      log(`!  ${item.slot} — fayl topilmadi: ${item.file}`);
      missing++;
      continue;
    }

    if (dry) {
      log(`~  ${item.slot} ← ${item.file.slice(root.length + 1)} (${Math.round(bytes.length / 1024)} KB) — yuklanadi`);
      migrated++;
      continue;
    }

    const saved = await saveImage(new Uint8Array(bytes), item.purpose);
    if (!saved.ok) {
      log(`!  ${item.slot} — ${saved.error}`);
      missing++;
      continue;
    }
    await putSlot({
      slot: item.slot,
      key: saved.key,
      url: saved.url,
      width: saved.meta.width,
      height: saved.meta.height,
      content_type: saved.meta.contentType,
      updated_at: new Date().toISOString(),
    });
    if (existing?.key && existing.key !== saved.key) await removeImage(existing.key);
    log(
      `+  ${item.slot} → ${saved.url} (${Math.round(bytes.length / 1024)} KB → ${Math.round(saved.meta.size / 1024)} KB, ${saved.meta.width}×${saved.meta.height})`,
    );
    migrated++;
  }

  return { migrated, skipped, missing };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const force = args.includes('--force');

  if (!dry && process.env.DIMED_MEDIA_MEMORY !== '1' && (!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_AUTH_TOKEN)) {
    console.error('NETLIFY_SITE_ID va NETLIFY_AUTH_TOKEN kerak (rasm Netlify Blobs’ga yuklanadi).');
    console.error('  Site ID: Netlify → Site configuration → Site details');
    console.error('  Token:   Netlify → User settings → Applications → Personal access tokens');
    console.error('Avval rejani ko‘rish uchun: npm run migrate-images -- --dry');
    process.exit(1);
  }

  const { printTarget } = await import('./aws-env.mjs');
  printTarget();
  if (dry) console.log('Sinov rejimi (--dry): hech narsa yozilmaydi.\n');

  try {
    const r = await migrateImages({ dry, force });
    console.log(`\nTayyor: ${r.migrated} ta ${dry ? 'yuklanadi' : 'ko‘chirildi'}, ${r.skipped} ta allaqachon bor, ${r.missing} ta topilmadi.`);
    if (!dry && r.migrated) {
      console.log('Sayt keshi 5 daqiqagacha eski rasmni ko‘rsatishi mumkin — keyin o‘zi yangilanadi.');
    }
  } catch (err) {
    if (err?.name === 'ResourceNotFoundException') {
      console.error('\nsite_media jadvali topilmadi. Avval: npm run create-visiting-tables');
      process.exit(1);
    }
    throw err;
  }
}
