import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'SportGather', template: '%s · SportGather' },
  description: 'Kelola klub olahraga usia muda tanpa spreadsheet.',
  applicationName: 'SportGather',
  appleWebApp: { capable: true, title: 'SportGather', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0f1b3d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
