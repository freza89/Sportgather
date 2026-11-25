import type { Metadata } from 'next';
import Link from 'next/link';
import { ImportWizard } from '@/components/players/import-wizard';

export const metadata: Metadata = { title: 'Impor pemain' };

// A-04 · Impor pemain
export default async function ImporPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Impor pemain dari Excel</h1>
          <p className="type-body text-fg-secondary">
            Pemain yang diimpor langsung aktif; dokumen usia diunggah kemudian.
          </p>
        </div>
        <Link href={`/admin/${slug}/pemain`} className="text-brand">
          Batal
        </Link>
      </div>
      <ImportWizard slug={slug} />
    </div>
  );
}
