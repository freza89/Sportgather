'use client';

import {
  guessImportField,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  type ImportField,
  type ImportReport,
  type ImportRow,
} from '@sportgather/shared';
import { Alert, Button, Card, IconFile, IconUpload, Select, Stepper } from '@sportgather/ui';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api-client';
import { readSpreadsheet, type SheetTable } from '@/lib/spreadsheet';

const STEPS = ['Unggah file', 'Petakan kolom', 'Pratinjau & impor'];
const FIELD_OPTIONS = [
  { value: '', label: 'Abaikan kolom' },
  ...Object.entries(IMPORT_FIELDS).map(([value, label]) => ({ value, label })),
];

// A-04 · Impor pemain dari Excel/CSV. File dibaca di browser; server memvalidasi per baris.
export function ImportWizard({ slug }: { slug: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<SheetTable | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [done, setDone] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const step = done ? 2 : table ? 1 : 0;

  async function load(f: File) {
    setError(null);
    setReport(null);
    try {
      const t = await readSpreadsheet(f);
      if (t.rows.length === 0) throw new Error('File tidak berisi data');
      if (t.rows.length > MAX_IMPORT_ROWS)
        throw new Error(`Maksimal ${MAX_IMPORT_ROWS} baris per impor`);
      const used = new Set<string>();
      setMapping(
        t.headers.map((h) => {
          const g = guessImportField(h);
          if (!g || used.has(g)) return '';
          used.add(g);
          return g;
        }),
      );
      setFile(f);
      setTable(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File tidak bisa dibaca');
    }
  }

  function rows(): ImportRow[] {
    return table!.rows.map((r) => {
      const row: ImportRow = {};
      mapping.forEach((field, i) => {
        if (field) row[field as ImportField] = r[i] ?? '';
      });
      return row;
    });
  }

  async function check(commit: boolean) {
    const missing = (
      ['fullName', 'birthDate', 'gender', 'guardianName', 'guardianPhone'] as const
    ).filter((f) => !mapping.includes(f));
    if (missing.length)
      return setError(`Petakan kolom: ${missing.map((m) => IMPORT_FIELDS[m]).join(', ')}`);
    setBusy(true);
    setError(null);
    const res = await api<ImportReport>('POST', `/orgs/${slug}/players/import`, {
      rows: rows(),
      commit,
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    if (commit) setDone(res.data);
    else setReport(res.data);
  }

  function downloadErrors() {
    if (!report) return;
    const lines = [
      'Baris,Masalah',
      ...[...report.errors, ...report.duplicates]
        .sort((a, b) => a.row - b.row)
        .map((e) => `${e.row},"${e.message.replace(/"/g, '""')}"`),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'error-impor-pemain.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={STEPS} current={step} />

      {done ? (
        <Card className="flex flex-col items-start gap-4 p-6">
          <h2 className="type-h2">{done.imported} pemain berhasil diimpor</h2>
          <p className="type-body text-fg-secondary">
            {done.errors.length} baris error dan {done.duplicates.length} kemungkinan duplikat tidak
            ikut diimpor. KU dihitung otomatis dari tanggal lahir.
          </p>
          <Link href={`/admin/${slug}/pemain`} className="text-brand">
            Lihat daftar pemain →
          </Link>
        </Card>
      ) : null}

      {!table && !done ? (
        <Card className="flex flex-col gap-4 p-6">
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-control border-2 border-dashed border-line p-10 text-center hover:border-brand">
            <span className="flex size-12 items-center justify-center rounded-control bg-brand-tint text-brand">
              <IconUpload />
            </span>
            <span className="type-h3">Pilih file Excel (.xlsx) atau CSV</span>
            <span className="type-body-sm text-fg-secondary">
              Baris pertama berisi judul kolom · maks. {MAX_IMPORT_ROWS} baris
            </span>
            <input
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])}
            />
          </label>
          <p className="type-caption text-fg-muted">
            Kolom yang dibutuhkan: nama anak, tanggal lahir, gender (L/P), nama wali, dan nomor
            WhatsApp wali. Sekolah opsional.
          </p>
        </Card>
      ) : null}

      {table && file && !done ? (
        <>
          <Card className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-control bg-success-bg text-success">
              <IconFile size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate type-body-medium">{file.name}</p>
              <p className="type-caption text-fg-muted">{table.rows.length} baris</p>
            </div>
            <button
              type="button"
              className="text-brand"
              onClick={() => {
                setTable(null);
                setReport(null);
              }}
            >
              Ganti file
            </button>
          </Card>

          <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
            <Card className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-line bg-canvas/60 type-caption-bold text-fg-secondary">
                  <tr>
                    <th className="px-4 py-3">Kolom di Excel</th>
                    <th className="px-4 py-3">Contoh isi</th>
                    <th className="px-4 py-3">Simpan sebagai</th>
                  </tr>
                </thead>
                <tbody>
                  {table.headers.map((h, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 type-body">{h}</td>
                      <td className="px-4 py-2 type-body text-fg-secondary">
                        {table.rows[0]?.[i] || '—'}
                      </td>
                      <td className="px-4 py-2">
                        <Select
                          label={<span className="sr-only">Simpan {h} sebagai</span>}
                          value={mapping[i] ?? ''}
                          options={FIELD_OPTIONS}
                          onChange={(e) => {
                            setReport(null);
                            setMapping(
                              mapping.map((m, j) =>
                                j === i
                                  ? e.target.value
                                  : m === e.target.value && e.target.value
                                    ? ''
                                    : m,
                              ),
                            );
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="flex flex-col gap-4 p-5">
              <h2 className="type-h3">Hasil pemeriksaan</h2>
              {report ? (
                <>
                  <p className="type-body">
                    <strong className="type-h2 text-success">{report.ready}</strong> baris siap
                    diimpor
                  </p>
                  <p className="type-body">
                    <strong className="type-h2 text-danger">{report.errors.length}</strong> baris
                    error — tidak ikut diimpor
                  </p>
                  <p className="type-body">
                    <strong className="type-h2 text-warning">{report.duplicates.length}</strong>{' '}
                    kemungkinan duplikat
                  </p>
                  {report.errors.length + report.duplicates.length > 0 ? (
                    <ul className="max-h-60 overflow-y-auto rounded-control bg-canvas p-3 type-body-sm text-fg-secondary">
                      {[...report.errors, ...report.duplicates]
                        .sort((a, b) => a.row - b.row)
                        .slice(0, 100)
                        .map((e) => (
                          <li key={`${e.row}-${e.message}`}>
                            Baris {e.row} · {e.message}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    {report.errors.length + report.duplicates.length > 0 ? (
                      <Button variant="secondary" onClick={downloadErrors}>
                        Unduh daftar error
                      </Button>
                    ) : null}
                    <Button onClick={() => void check(true)} disabled={busy || report.ready === 0}>
                      {busy ? 'Mengimpor…' : `Impor ${report.ready} pemain`}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="type-body text-fg-secondary">
                    Periksa pemetaan kolom, lalu cek data sebelum diimpor.
                  </p>
                  <Button onClick={() => void check(false)} disabled={busy}>
                    {busy ? 'Memeriksa…' : 'Periksa data'}
                  </Button>
                </>
              )}
            </Card>
          </div>
        </>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
