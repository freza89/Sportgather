// Mengubah SVG ikon hasil ekspor Figma (halaman "00 · Design System" › Ikon) menjadi komponen React.
// Geometri path tidak diubah; hanya warna stroke tetap (#0F1B3D) diganti `currentColor`
// agar ikon mengikuti warna teks komponen (NavItem/TabItem aktif vs default).
// Jalankan: pnpm --filter @sportgather/ui icons
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'assets/icons');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.svg'))
  .sort();

const pascal = (name) => name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
const attr = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());

const entries = files.map((file) => {
  const name = file.replace(/\.svg$/, '');
  const svg = readFileSync(join(dir, file), 'utf8');
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<g id="glyph">|<\/g>/g, '')
    .replace(/ id="[^"]*"/g, '')
    .replace(/stroke="#0F1B3D"/gi, 'stroke="currentColor"')
    .replace(/fill="#0F1B3D"/gi, 'fill="currentColor"')
    .replace(/([a-z]+(?:-[a-z]+)+)=/g, (_, a) => `${attr(a)}=`)
    .trim()
    .replace(/\n/g, '\n      ');
  if (/#[0-9a-f]{3,6}/i.test(inner)) throw new Error(`Warna tetap tersisa di ${file}`);
  return { name, component: `Icon${pascal(name)}`, inner };
});

const out = `// FILE HASIL GENERATE — jangan diedit manual. Sumber: assets/icons/*.svg (Figma), skrip: scripts/generate-icons.mjs
import type { SVGProps } from 'react';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function base({ size = 24, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': props['aria-label'] ? undefined : true,
    focusable: false,
    ...props,
  } as const;
}

${entries
  .map(
    (e) => `export function ${e.component}(props: IconProps) {
  return (
    <svg {...base(props)}>
      ${e.inner}
    </svg>
  );
}`,
  )
  .join('\n\n')}

export const ICONS = {
${entries.map((e) => `  ${JSON.stringify(e.name)}: ${e.component},`).join('\n')}
} as const;

export type IconName = keyof typeof ICONS;
`;

writeFileSync(join(root, 'src/icons/index.tsx'), out);
console.log(`${entries.length} ikon ditulis ke src/icons/index.tsx`);
