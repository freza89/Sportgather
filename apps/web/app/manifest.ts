import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SportGather',
    short_name: 'SportGather',
    description: 'Jadwal, absensi, iuran, dan rapor klub olahraga usia muda.',
    lang: 'id',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f6fa',
    theme_color: '#0f1b3d',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
